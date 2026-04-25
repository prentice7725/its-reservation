import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { HttpsCookieAgent } from 'http-cookie-agent/http';
import { v4 as uuidv4 } from 'uuid';

const baseUrl = "https://as.its-kenpo.or.jp";
const DEFAULT_RETRYABLE_RESULTS = new Set(['error']);

function sleep(ms, signal) {
    if (ms <= 0) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, ms);

        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                resolve();
            }, { once: true });
        }
    });
}

// 유틸리티 함수들 (기존 코드에서 가져옴)
function extractAuthToken(html) {
    let match = html.match(/name="authenticity_token"\s+value="([^"]+)"/i);
    if (match) return match[1];

    match = html.match(/value="([^"]+)"\s+name="authenticity_token"/i);
    if (match) return match[1];

    match = html.match(/name='authenticity_token'\s+value='([^']+)'/i);
    if (match) return match[1];

    match = html.match(/<input[^>]*authenticity_token[^>]*value=["']([^"']+)["']/i);
    if (match) return match[1];

    match = html.match(/<input[^>]*value=["']([^"']+)["'][^>]*authenticity_token/i);
    if (match) return match[1];

    return null;
}

function extractCSRFToken(html) {
    let match = html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
    if (match) return match[1];

    match = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i);
    if (match) return match[1];

    return null;
}

function extractSessionGuid(html) {
    const match = html.match(/name="apply_session_guid"[^>]*value="([^"]+)"/i);
    return match ? match[1] : null;
}

function parseAvailableRooms(html) {
    const regex = /name="apply\[coma\[(\d+)\]\]"/g;
    const rooms = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
        rooms.push(match[1]);
    }

    return rooms;
}

function parseAvailableDates(html) {
    const optionRegex = /<option[^>]*value=["']([^"']{4}-[^"']{2}-[^"']{2})["'][^>]*>/g;
    const dates = [];
    let match;

    while ((match = optionRegex.exec(html)) !== null) {
        dates.push(match[1]);
    }

    return [...new Set(dates)];
}

function createFormData(data) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined && value !== '') {
            params.append(key, value);
        }
    }
    return params;
}

function createMultipartData(data, boundary) {
    let body = '';

    for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
            body += `------${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            body += `${value}\r\n`;
        }
    }

    body += `------${boundary}--\r\n`;
    return body;
}

// 메인 예약 함수
export async function runHTTPReservation(config, onLog = () => {}) {
    const retryConfig = config.burstRetry || {};

    if (retryConfig.enabled) {
        const maxAttempts = Math.max(1, Math.min(Number.parseInt(retryConfig.maxAttempts, 10) || 10, 50));
        const intervalMs = Math.max(100, Math.min(Number.parseInt(retryConfig.intervalMs, 10) || 300, 5000));
        const maxDurationMs = Math.max(intervalMs, Math.min(Number.parseInt(retryConfig.maxDurationMs, 10) || 10000, 60000));
        const retryableResults = new Set(DEFAULT_RETRYABLE_RESULTS);

        if (retryConfig.retryNoRooms) {
            retryableResults.add('no_rooms');
        }

        const startedAt = Date.now();
        let lastResult = 'error';

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (config.signal?.aborted) {
                return 'cancelled';
            }

            if (attempt > 1) {
                onLog('info', `  [재시도 ${attempt}/${maxAttempts}]`);
            }

            lastResult = await runHTTPReservationOnce(config, onLog);

            if (lastResult === 'success' || lastResult === 'cancelled' || !retryableResults.has(lastResult)) {
                return lastResult;
            }

            const elapsedMs = Date.now() - startedAt;
            if (attempt >= maxAttempts || elapsedMs + intervalMs > maxDurationMs) {
                break;
            }

            await sleep(intervalMs, config.signal);
        }

        return lastResult;
    }

    return runHTTPReservationOnce(config, onLog);
}

async function runHTTPReservationOnce(config, onLog = () => {}) {
    const { place, date, numPeople, emailAddr, numRooms, peoplePerRoom, nightCount = 1, queryStringing, signal } = config;
    const queryString = queryStringing; // 변수명 통일

    const jar = new CookieJar();
    const client = axios.create({
        httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
        signal,
    });

    try {
        if (signal?.aborted) {
            onLog('warning', `[HTTP] ${place} - ${date} 중단됨`);
            return 'cancelled';
        }

        const pageUrl = `${baseUrl}/apply/empty_new?s=${queryStringing}`;

        onLog('info', `[HTTP] ${place} - ${date} 시작`);

        // STEP 1: 초기 페이지 로드
        onLog('info', '  [1/7] 초기 페이지 로드...');
        const initialResponse = await client.get(pageUrl);

        if (initialResponse.status !== 200) {
            onLog('error', `  ❌ 초기 로드 실패: ${initialResponse.status}`);
            return 'error';
        }

        let authToken = extractAuthToken(initialResponse.data);
        const csrfToken = extractCSRFToken(initialResponse.data);

        if (!authToken && csrfToken) {
            authToken = csrfToken;
        }

        onLog('info', `  ✓ 토큰 획득`);

        if (!authToken) {
            onLog('error', '  ❌ 토큰 획득 실패');
            return 'error';
        }

        // STEP 2: 첫 검색 요청
        onLog('info', '  [2/7] 첫 검색 요청...');

        const searchData = createFormData({
            'utf8': '✓',
            'authenticity_token': authToken,
            'apply[join_time]': date,
            'apply[night_count]': nightCount.toString(),
            'apply[stay_persons]': numPeople.toString(),
            'apply[hope_rooms]': numRooms.toString(),
            'apply[hope_room1]': peoplePerRoom[0]?.toString() || '',
            'apply[hope_room2]': peoplePerRoom[1]?.toString() || '',
            'apply[hope_room3]': '',
            'apply[hope_room4]': '',
            'apply[hope_room5]': '',
            'apply[hope_room6]': '',
            'apply[hope_room7]': '',
            'apply[hope_room8]': '',
            'apply[hope_room9]': '',
            'apply[hope_room10]': '',
        });

        const searchResponse = await client.post(
            `${baseUrl}/apply/empty_new?s=${queryString}`,
            searchData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-CSRF-Token': csrfToken || authToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': '*/*',
                    'Origin': baseUrl,
                    'Referer': pageUrl,
                }
            }
        );

        if (searchResponse.status !== 200) {
            onLog('error', `  ❌ 검색 실패: ${searchResponse.status}`);
            return 'no_rooms';
        }

        // JavaScript 응답 언이스케이프
        let responseHtml = searchResponse.data;

        const comaHtmlStart = responseHtml.indexOf("$('#coma').html(");
        if (comaHtmlStart !== -1) {
            const quoteStart = responseHtml.indexOf('"', comaHtmlStart + 16);
            if (quoteStart === -1) {
                const singleQuoteStart = responseHtml.indexOf("'", comaHtmlStart + 16);
                if (singleQuoteStart !== -1) {
                    const quoteEnd = responseHtml.lastIndexOf("'");
                    responseHtml = responseHtml.substring(singleQuoteStart + 1, quoteEnd);
                }
            } else {
                const endPattern = '");';
                const quoteEnd = responseHtml.lastIndexOf(endPattern);
                if (quoteEnd !== -1) {
                    responseHtml = responseHtml.substring(quoteStart + 1, quoteEnd);
                } else {
                    const lastQuote = responseHtml.lastIndexOf('"');
                    responseHtml = responseHtml.substring(quoteStart + 1, lastQuote);
                }
            }

            responseHtml = responseHtml
                .replace(/\\\\/g, '\x00')
                .replace(/\\"/g, '"')
                .replace(/\\'/g, "'")
                .replace(/\\\//g, '/')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\x00/g, '\\');
        }

        // STEP 3: session_guid 추출
        onLog('info', '  [3/7] 사용 가능한 방 파싱...');

        let sessionGuid = extractSessionGuid(responseHtml);

        if (!sessionGuid) {
            sessionGuid = uuidv4();
            onLog('info', `  ℹ️ Session GUID 없음, 생성`);
        } else {
            onLog('info', `  ✓ Session GUID 획득`);
        }

        const availableRooms = parseAvailableRooms(responseHtml);

        onLog('info', `  ✓ 사용 가능한 방: ${availableRooms.length}개`);

        if (availableRooms.length === 0) {
            return 'no_rooms';
        }

        if (availableRooms.length < numRooms) {
            return 'insufficient_rooms';
        }

        // STEP 4: 방 선택
        onLog('info', '  [4/7] 방 선택...');

        const selectedRooms = availableRooms.slice(0, numRooms);

        const boundary = `WebKitFormBoundary${Math.random().toString(36).substring(2)}`;

        const selectData = {
            'utf8': '✓',
            'authenticity_token': authToken,
            'apply[join_time]': date,
            'apply[night_count]': nightCount.toString(),
            'apply[stay_persons]': numPeople.toString(),
            'apply[hope_rooms]': numRooms.toString(),
            'apply[hope_room1]': peoplePerRoom[0]?.toString() || '',
            'apply[hope_room2]': peoplePerRoom[1]?.toString() || '',
            'apply[hope_room3]': '',
            'apply[hope_room4]': '',
            'apply[hope_room5]': '',
            'apply[hope_room6]': '',
            'apply[hope_room7]': '',
            'apply[hope_room8]': '',
            'apply[hope_room9]': '',
            'apply[hope_room10]': '',
            'apply_session_guid': sessionGuid,
        };

        selectedRooms.forEach(roomId => {
            selectData[`apply[coma[${roomId}]]`] = roomId;
        });

        const selectBody = createMultipartData(selectData, boundary);

        const selectResponse = await client.post(
            `${baseUrl}/apply/empty_create?s=${queryString}`,
            selectBody,
            {
                headers: {
                    'Content-Type': `multipart/form-data; boundary=----${boundary}`,
                    'Origin': baseUrl,
                    'Referer': pageUrl,
                },
            }
        );

        if (![200, 302].includes(selectResponse.status)) {
            onLog('error', `  ❌ 방 선택 실패: ${selectResponse.status}`);
            return 'error';
        }

        let newS = queryString;
        if (selectResponse.headers.location) {
            const locationMatch = selectResponse.headers.location.match(/[?&]s=([^&]+)/);
            if (locationMatch) {
                newS = locationMatch[1];
            }
        }

        onLog('info', `  ✓ 방 선택 성공`);

        // STEP 5: 약관 동의 페이지
        onLog('info', '  [5/7] 약관 동의 페이지...');

        const rulePageResponse = await client.get(
            `${baseUrl}/apply/rule?s=${newS}`,
            {
                headers: {
                    'Referer': `${baseUrl}/apply/empty_new?s=${queryString}`,
                }
            }
        );

        const ruleAuthToken = extractAuthToken(rulePageResponse.data) || authToken;

        const ruleAgreeResponse = await client.post(
            `${baseUrl}/apply/email_input`,
            createFormData({
                'utf8': '✓',
                'authenticity_token': ruleAuthToken,
                's': newS,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': baseUrl,
                    'Referer': `${baseUrl}/apply/rule`,
                }
            }
        );

        onLog('info', `  ✓ 약관 동의 완료`);

        // STEP 6: 이메일 입력 페이지
        onLog('info', '  [6/7] 이메일 페이지 로드...');

        const emailAuthToken = extractAuthToken(ruleAgreeResponse.data) || authToken;
        const emailToken = ruleAgreeResponse.data.match(/name="__token__"[^>]*value="([^"]+)"/);
        const tokenValue = emailToken ? emailToken[1] : '';

        onLog('info', `  ✓ 이메일 페이지 로드`);

        // STEP 7: 최종 제출
        onLog('info', '  [7/7] 최종 제출...');

        const finalResponse = await client.post(
            `${baseUrl}/apply/send_complete?s=${newS}`,
            createFormData({
                'utf8': '✓',
                'authenticity_token': emailAuthToken,
                '__token__': tokenValue,
                'email': emailAddr,
                'commit': '送信',
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': baseUrl,
                    'Referer': `${baseUrl}/apply/email_input`,
                }
            }
        );

        if ([200, 302].includes(finalResponse.status)) {
            onLog('info', '  ✅ 성공!');
            return 'success';
        } else {
            onLog('error', `  ❌ 제출 실패: ${finalResponse.status}`);
            return 'error';
        }

    } catch (error) {
        if (signal?.aborted || error.code === 'ERR_CANCELED') {
            onLog('warning', `  중단됨: ${place} - ${date}`);
            return 'cancelled';
        }

        onLog('error', `  ⚠️ HTTP 오류: ${error.message}`);
        return 'error';
    }
}

export async function getReservationServerTime() {
    const clientStartedAt = Date.now();
    const response = await axios.get(baseUrl, {
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    });
    const clientReceivedAt = Date.now();
    const serverDateHeader = response.headers.date;
    const serverTimeMs = serverDateHeader ? new Date(serverDateHeader).getTime() : null;
    const midpointClientMs = Math.round((clientStartedAt + clientReceivedAt) / 2);

    return {
        serverDateHeader,
        serverTime: serverTimeMs ? new Date(serverTimeMs).toISOString() : null,
        clientTime: new Date(midpointClientMs).toISOString(),
        offsetMs: serverTimeMs ? serverTimeMs - midpointClientMs : null,
        roundTripMs: clientReceivedAt - clientStartedAt,
    };
}

export async function dryRunHTTPReservation(config, onLog = () => {}) {
    const { place, date, numPeople, emailAddr, numRooms, peoplePerRoom, nightCount = 1, queryStringing, signal } = config;
    const checks = [];

    const addCheck = (name, ok, message) => {
        checks.push({ name, ok, message });
        onLog(ok ? 'info' : 'warning', `[점검] ${name}: ${message}`);
    };

    addCheck('장소', Boolean(place && queryStringing), queryStringing ? `${place} queryString 확인` : `${place || '-'} queryString 없음`);
    addCheck('날짜', Boolean(date), date || '날짜 없음');
    addCheck('이메일', Boolean(emailAddr), emailAddr ? '입력됨' : '이메일 없음');
    addCheck('방/인원', Boolean(numRooms && peoplePerRoom?.length), `${numRooms || 0}개 방 / ${numPeople || 0}명`);

    if (!queryStringing || !date) {
        return {
            success: false,
            checks,
            message: '필수 설정이 부족합니다',
        };
    }

    const jar = new CookieJar();
    const client = axios.create({
        httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
        signal,
        timeout: 8000,
    });

    try {
        const pageUrl = `${baseUrl}/apply/empty_new?s=${queryStringing}`;
        const initialResponse = await client.get(pageUrl);
        const pageOk = initialResponse.status === 200;
        addCheck('초기 페이지', pageOk, `HTTP ${initialResponse.status}`);

        if (!pageOk) {
            return {
                success: false,
                checks,
                message: '초기 페이지 접근 실패',
            };
        }

        let authToken = extractAuthToken(initialResponse.data);
        const csrfToken = extractCSRFToken(initialResponse.data);
        if (!authToken && csrfToken) {
            authToken = csrfToken;
        }

        addCheck('토큰', Boolean(authToken), authToken ? '획득 성공' : '획득 실패');

        const availableDates = parseAvailableDates(initialResponse.data);
        if (availableDates.length > 0) {
            addCheck('날짜 옵션', availableDates.includes(date), availableDates.includes(date) ? '예약 날짜 옵션 확인' : '예약 날짜가 옵션에 없음');
        } else {
            addCheck('날짜 옵션', true, '페이지에서 날짜 옵션을 확인하지 못했지만 계속 가능');
        }

        return {
            success: checks.every((check) => check.ok),
            checks,
            message: checks.every((check) => check.ok) ? '사전 점검 통과' : '확인이 필요한 항목이 있습니다',
        };
    } catch (error) {
        addCheck('네트워크', false, error.message);
        return {
            success: false,
            checks,
            message: '사전 점검 중 오류가 발생했습니다',
        };
    }
}

// 세마포어 (동시 실행 제어)
export class Semaphore {
    constructor(permits) {
        this.permits = permits;
        this.waiting = [];
    }

    async acquire(signal) {
        if (signal?.aborted) {
            return false;
        }

        if (this.permits > 0) {
            this.permits--;
            return true;
        }

        return new Promise(resolve => {
            const waiter = { resolve, signal };

            const onAbort = () => {
                this.waiting = this.waiting.filter(item => item !== waiter);
                resolve(false);
            };

            if (signal) {
                waiter.onAbort = onAbort;
                signal.addEventListener('abort', onAbort, { once: true });
            }

            this.waiting.push(waiter);
        });
    }

    release() {
        this.permits++;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            if (next.onAbort) {
                next.signal?.removeEventListener('abort', next.onAbort);
            }
            this.permits--;
            next.resolve(true);
        }
    }
}
