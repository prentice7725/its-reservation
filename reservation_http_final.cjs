// 최종 완성 버전 - session_guid를 서버 응답에서 추출
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const { v4: uuidv4 } = require('uuid');

// 장소별 쿼리 스트링 매핑
const PLACE_QUERIES = {
    karuizawa: "PT1RT3hnVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    tateyama: "PT1RTTJjVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    biore: "PT1BTzFjVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    washorim: "PT1RTzFjVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    yuzawa: "PT1BTTJjVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    nikko: "PT13TTNrVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    rafista: "PVlETzFFVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    risoru: "PWNETzFFVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    ikaho: "PT13TndFVE05UVdhbWtIYndCWFk5SVhac3gyYnlSbmJ2TjJYdmRtSjNWbWJmbEhkdzFXWjk0MmJwUjNZaDkxYm5aU1oxSkhkOWtIZHcxV1o%3D",
    kusatsu: "PT1RTXcwaU53MGlNeUFqTTlVV2JwUjNYdWwyYnFaaU0yY1RQa2xtSmxWbmMwMVRaeVZIZHdGMllmVkdibjkyYm5aU1oxSkhkOWtIZHcxV1o%3D",
    kamakura: "PT1BTXdrVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    izu: "PWdUTXdFVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    hamana: "PVV6TjNFVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    blueberry: "PT1RTjJjVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    yuhuin: "PU1ETnpJVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D",
    alivila: "PWNUTTBJVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D"
};

const CONFIG = {
    baseUrl: "https://as.its-kenpo.or.jp",
    emailAddr: 'prentice7725@gmail.com',
    numRooms: 2,
    peoplePerRoom: [3, 3],
    nightCount: 1,
    debug: false,
};

// Auth Token 추출
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

// CSRF 토큰 추출
function extractCSRFToken(html) {
    let match = html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
    if (match) return match[1];
    
    match = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i);
    if (match) return match[1];
    
    return null;
}

// session_guid 추출
function extractSessionGuid(html) {
    // name="apply_session_guid"와 value="..." 사이에 다른 속성(id 등)이 있을 수 있음
    const match = html.match(/name="apply_session_guid"[^>]*value="([^"]+)"/i);
    return match ? match[1] : null;
}

// 사용 가능한 방 ID 추출
function parseAvailableRooms(html) {
    const regex = /name="apply\[coma\[(\d+)\]\]"/g;
    const rooms = [];
    let match;
    
    while ((match = regex.exec(html)) !== null) {
        rooms.push(match[1]);
    }
    
    return rooms;
}

// URLSearchParams 생성
function createFormData(data) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined && value !== '') {
            params.append(key, value);
        }
    }
    return params;
}

// Multipart form data 생성
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

// 단일 예약 함수
async function runHTTPReservation(place, numPeople, date) {
    const jar = new CookieJar();
    const client = axios.create({
        httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        maxRedirects: 0,  // 모든 리다이렉트 비활성화!
        validateStatus: (status) => status < 400,  // 200-399 모두 정상
    });
    
    try {
        const queryStr = PLACE_QUERIES[place];
        const pageUrl = `${CONFIG.baseUrl}/apply/empty_new?s=${queryStr}`;
        
        console.log(`[HTTP] ${place} - ${date} 시작`);
        
        // ========================================
        // STEP 1: 초기 페이지 로드
        // ========================================
        console.log('  [1/7] 초기 페이지 로드...');
        const initialResponse = await client.get(pageUrl);
        
        if (initialResponse.status !== 200) {
            console.log(`  ❌ 초기 로드 실패: ${initialResponse.status}`);
            return 'error';
        }
        
        // 토큰들 추출
        let authToken = extractAuthToken(initialResponse.data);
        const csrfToken = extractCSRFToken(initialResponse.data);
        
        // CSRF 토큰을 Auth Token으로 사용
        if (!authToken && csrfToken) {
            authToken = csrfToken;
        }
        
        console.log(`  ✓ 토큰 획득`);
        
        if (!authToken) {
            console.log('  ❌ 토큰 획득 실패');
            return 'error';
        }
        
        // ========================================
        // STEP 2: 첫 검색 요청 (session_guid 없이!)
        // ========================================
        console.log('  [2/7] 첫 검색 요청...');
        
        const searchData = createFormData({
            'utf8': '✓',
            'authenticity_token': authToken,
            'apply[join_time]': date,
            'apply[night_count]': CONFIG.nightCount.toString(),
            'apply[stay_persons]': numPeople.toString(),
            'apply[hope_rooms]': CONFIG.numRooms.toString(),
            'apply[hope_room1]': CONFIG.peoplePerRoom[0]?.toString() || '',
            'apply[hope_room2]': CONFIG.peoplePerRoom[1]?.toString() || '',
            'apply[hope_room3]': '',
            'apply[hope_room4]': '',
            'apply[hope_room5]': '',
            'apply[hope_room6]': '',
            'apply[hope_room7]': '',
            'apply[hope_room8]': '',
            'apply[hope_room9]': '',
            'apply[hope_room10]': '',
            // apply_session_guid는 첫 요청에 없음!
        });
        
        const searchResponse = await client.post(
            `${CONFIG.baseUrl}/apply/empty_new?s=${queryStr}`,
            searchData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-CSRF-Token': csrfToken || authToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': '*/*',
                    'Origin': CONFIG.baseUrl,
                    'Referer': pageUrl,
                }
            }
        );
        
        if (searchResponse.status !== 200) {
            console.log(`  ❌ 검색 실패: ${searchResponse.status}`);
            return 'no_rooms';
        }
        
        // ========================================
        // JavaScript 응답 언이스케이프
        // ========================================
        let responseHtml = searchResponse.data;
        
        // jQuery 응답에서 HTML 추출 (수동 파싱)
        const comaHtmlStart = responseHtml.indexOf("$('#coma').html(");
        if (comaHtmlStart !== -1) {
            // 시작 따옴표 찾기
            const quoteStart = responseHtml.indexOf('"', comaHtmlStart + 16);
            if (quoteStart === -1) {
                const singleQuoteStart = responseHtml.indexOf("'", comaHtmlStart + 16);
                if (singleQuoteStart !== -1) {
                    const quoteEnd = responseHtml.lastIndexOf("'");
                    responseHtml = responseHtml.substring(singleQuoteStart + 1, quoteEnd);
                }
            } else {
                // 마지막 ");를 찾음
                const endPattern = '");';
                const quoteEnd = responseHtml.lastIndexOf(endPattern);
                if (quoteEnd !== -1) {
                    responseHtml = responseHtml.substring(quoteStart + 1, quoteEnd);
                } else {
                    const lastQuote = responseHtml.lastIndexOf('"');
                    responseHtml = responseHtml.substring(quoteStart + 1, lastQuote);
                }
            }
            
            // JavaScript 문자열 언이스케이프
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
        
        // ========================================
        // STEP 3: 응답에서 session_guid 추출
        // ========================================
        console.log('  [3/7] 사용 가능한 방 파싱...');
        
        let sessionGuid = extractSessionGuid(responseHtml);
        
        // 응답에 없으면 UUID 생성
        if (!sessionGuid) {
            sessionGuid = uuidv4();
            console.log(`  ℹ️ Session GUID 없음, 생성`);
        } else {
            console.log(`  ✓ Session GUID 획득`);
        }
        
        const availableRooms = parseAvailableRooms(responseHtml);
        
        console.log(`  ✓ 사용 가능한 방: ${availableRooms.length}개`);
        
        if (availableRooms.length === 0) {
            return 'no_rooms';
        }
        
        if (availableRooms.length < CONFIG.numRooms) {
            return 'insufficient_rooms';
        }
        
        // ========================================
        // STEP 4: 방 선택 (Multipart, session_guid 포함)
        // ========================================
        console.log('  [4/7] 방 선택...');
        
        const selectedRooms = availableRooms.slice(0, CONFIG.numRooms);
        
        const boundary = `WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
        
        const selectData = {
            'utf8': '✓',
            'authenticity_token': authToken,
            'apply[join_time]': date,
            'apply[night_count]': CONFIG.nightCount.toString(),
            'apply[stay_persons]': numPeople.toString(),
            'apply[hope_rooms]': CONFIG.numRooms.toString(),
            'apply[hope_room1]': CONFIG.peoplePerRoom[0]?.toString() || '',
            'apply[hope_room2]': CONFIG.peoplePerRoom[1]?.toString() || '',
            'apply[hope_room3]': '',
            'apply[hope_room4]': '',
            'apply[hope_room5]': '',
            'apply[hope_room6]': '',
            'apply[hope_room7]': '',
            'apply[hope_room8]': '',
            'apply[hope_room9]': '',
            'apply[hope_room10]': '',
            'apply_session_guid': sessionGuid, // 이제 포함!
        };
        
        // 선택된 방 추가
        selectedRooms.forEach(roomId => {
            selectData[`apply[coma[${roomId}]]`] = roomId;
        });
        
        const selectBody = createMultipartData(selectData, boundary);
        
        const selectResponse = await client.post(
            `${CONFIG.baseUrl}/apply/empty_create?s=${queryStr}`,
            selectBody,
            {
                headers: {
                    'Content-Type': `multipart/form-data; boundary=----${boundary}`,
                    'Origin': CONFIG.baseUrl,
                    'Referer': pageUrl,
                },
            }
        );
        
        if (![200, 302].includes(selectResponse.status)) {
            console.log(`  ❌ 방 선택 실패: ${selectResponse.status}`);
            return 'error';
        }
        
        // 새로운 s 파라미터 추출 (Location 헤더에서)
        let newS = queryStr;
        if (selectResponse.headers.location) {
            const locationMatch = selectResponse.headers.location.match(/[?&]s=([^&]+)/);
            if (locationMatch) {
                newS = locationMatch[1];
            }
        }
        
        console.log(`  ✓ 방 선택 성공`);
        
        // ========================================
        // STEP 5: 약관 동의 페이지 (/apply/rule)
        // ========================================
        console.log('  [5/7] 약관 동의 페이지...');
        
        const rulePageResponse = await client.get(
            `${CONFIG.baseUrl}/apply/rule?s=${newS}`,
            {
                headers: {
                    'Referer': `${CONFIG.baseUrl}/apply/empty_new?s=${queryStr}`,
                }
            }
        );
        
        // 약관 페이지에서 토큰 추출
        const ruleAuthToken = extractAuthToken(rulePageResponse.data) || authToken;
        
        // 약관 동의 버튼 클릭 (POST) - Referer에 ?s 없음!
        const ruleAgreeResponse = await client.post(
            `${CONFIG.baseUrl}/apply/email_input`,
            createFormData({
                'utf8': '✓',
                'authenticity_token': ruleAuthToken,
                's': newS,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': CONFIG.baseUrl,
                    'Referer': `${CONFIG.baseUrl}/apply/rule`,  // ?s 없음!
                }
            }
        );
        
        console.log(`  ✓ 약관 동의 완료`);
        
        // ========================================
        // STEP 6: 이메일 입력 페이지
        // ========================================
        console.log('  [6/7] 이메일 페이지 로드...');
        
        // 새 토큰 추출 (ruleAgreeResponse에서)
        const emailAuthToken = extractAuthToken(ruleAgreeResponse.data) || authToken;
        const emailToken = ruleAgreeResponse.data.match(/name="__token__"[^>]*value="([^"]+)"/);
        const tokenValue = emailToken ? emailToken[1] : '';
        
        console.log(`  ✓ 이메일 페이지 로드`);
        
        // ========================================
        // STEP 7: 최종 제출
        // ========================================
        console.log('  [7/7] 최종 제출...');
        
        const finalResponse = await client.post(
            `${CONFIG.baseUrl}/apply/send_complete?s=${newS}`,
            createFormData({
                'utf8': '✓',
                'authenticity_token': emailAuthToken,
                '__token__': tokenValue,
                'email': CONFIG.emailAddr,
                'commit': '送信',
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': CONFIG.baseUrl,
                    'Referer': `${CONFIG.baseUrl}/apply/email_input`,
                }
            }
        );
        
        if ([200, 302].includes(finalResponse.status)) {
            console.log('  ✅ 성공!');
            return 'success';
        } else {
            console.log(`  ❌ 제출 실패: ${finalResponse.status}`);
            return 'error';
        }
        
    } catch (error) {
        console.error(`  ⚠️ HTTP 오류: ${error.message}`);
        if (CONFIG.debug && error.response) {
            console.error(`  [DEBUG] 응답 상태: ${error.response.status}`);
        }
        return 'error';
    }
}

// 세마포어
class Semaphore {
    constructor(permits) {
        this.permits = permits;
        this.waiting = [];
    }

    async acquire() {
        if (this.permits > 0) {
            this.permits--;
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }

    release() {
        this.permits++;
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            this.permits--;
            next();
        }
    }
}

// 조합 생성
function generateCombinations(numPeople, dates) {
    const combinations = [];
    const places = Object.keys(PLACE_QUERIES);
    
    for (const place of places) {
        for (const date of dates) {
            combinations.push({ place, numPeople, date });
        }
    }
    
    return combinations;
}

// 병렬 실행
async function runMultipleHTTPReservations(numPeople, dates, concurrent = 50) {
    const combinations = generateCombinations(numPeople, dates);
    const semaphore = new Semaphore(concurrent);
    const startTime = Date.now();
    
    console.log(`🚀 HTTP 버전: ${combinations.length}개 조합 (동시 ${concurrent}개)\n`);
    
    const promises = combinations.map(async ({ place, numPeople: num, date }) => {
        await semaphore.acquire();
        
        try {
            const result = await runHTTPReservation(place, num, date);
            return { place, date, result };
        } finally {
            semaphore.release();
        }
    });
    
    const results = await Promise.allSettled(promises);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const successResults = results.filter(r => 
        r.status === 'fulfilled' && r.value.result === 'success'
    );
    
    const failedResults = results.filter(r =>
        r.status !== 'fulfilled' || r.value.result !== 'success'
    );
    
    console.log('\n' + '='.repeat(60));
    console.log(`⏱️ ${totalTime}초 | ✅ ${successResults.length} | ❌ ${failedResults.length}`);
    
    if (successResults.length > 0) {
        console.log('\n🎉 성공:');
        successResults.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                console.log(`  ${i + 1}. ${r.value.place} - ${r.value.date}`);
            }
        });
    }
    
    console.log('='.repeat(60));
    
    return results;
}

// 메인
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('사용법:');
        console.log('  테스트: node reservation_http_final.js test blueberry 6 2026-02-25 --email=your@email.com');
        console.log('  실행: node reservation_http_final.js 6 2026-02-25 --all --concurrent=50 --email=your@email.com');
        process.exit(1);
    }
    
    if (args.includes('--debug')) {
        CONFIG.debug = true;
        console.log('🔍 디버그 모드 활성화\n');
    }
    
    // 이메일 지정
    const emailArg = args.find(arg => arg.startsWith('--email='));
    if (emailArg) {
        CONFIG.emailAddr = emailArg.split('=')[1];
        console.log(`📧 이메일 설정: ${CONFIG.emailAddr}\n`);
    }
    
    if (args[0] === 'test') {
        const [_, place, numPeople, date] = args;
        runHTTPReservation(place, numPeople, date)
            .then(result => {
                console.log(`\n최종 결과: ${result}`);
                if (result === 'success') {
                    console.log(`✅ 예약 신청 완료!`);
                    console.log(`📧 ${CONFIG.emailAddr}로 메일을 확인하세요 (스팸함도 확인!)`);
                }
                process.exit(result === 'success' ? 0 : 1);
            })
            .catch(err => {
                console.error('오류:', err);
                process.exit(1);
            });
    } else {
        const numPeople = args[0];
        const dates = args[1].split(',');
        
        let concurrent = 50;
        const concurrentArg = args.find(arg => arg.startsWith('--concurrent='));
        if (concurrentArg) {
            concurrent = parseInt(concurrentArg.split('=')[1]);
        }
        
        runMultipleHTTPReservations(numPeople, dates, concurrent)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('오류:', err);
                process.exit(1);
            });
    }
}

module.exports = {
    runHTTPReservation,
    runMultipleHTTPReservations,
};
