const puppeteer = require('puppeteer');
const schedule = require('node-schedule');

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
    hamana: "PVV6TjNFVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D"
};

const CONFIG = {
    baseUrl: "https://as.its-kenpo.or.jp/apply/empty_new?s=",
    emailAddr: 'prentice7725@gmail.com',
    numRooms: 2,
    peoplePerRoom: [3, 3],
    scheduleInterval: "0/5 * * * * *",
    
    // 성능 최적화 설정
    pageTimeout: 15000,       // 타임아웃 단축 (30s → 15s)
    navigationTimeout: 5000,  // 네비게이션 타임아웃 단축
    browserPoolSize: 3,       // 브라우저 풀 크기
    reusePages: true,         // 페이지 재사용
    blockResources: true,     // 불필요한 리소스 차단
};

// 브라우저 풀
let browserPool = [];
let activeBrowsers = 0;

// 전역 변수
let successfulReservations = [];
let activeJobs = [];

// 설정 검증
function validateConfig() {
    if (CONFIG.peoplePerRoom.length !== CONFIG.numRooms) {
        throw new Error(
            `❌ 설정 오류: 방 개수(${CONFIG.numRooms})와 인원수 배열 길이(${CONFIG.peoplePerRoom.length})가 일치하지 않습니다.`
        );
    }
    
    const totalPeople = CONFIG.peoplePerRoom.reduce((a, b) => a + b, 0);
    console.log('✓ 설정 검증 완료:');
    console.log(`  - 방 개수: ${CONFIG.numRooms}개`);
    console.log(`  - 각 방 인원: ${CONFIG.peoplePerRoom.join(', ')}명`);
    console.log(`  - 총 인원: ${totalPeople}명`);
    console.log(`  - 브라우저 풀: ${CONFIG.browserPoolSize}개`);
    console.log(`  - 리소스 차단: ${CONFIG.blockResources ? '활성화' : '비활성화'}\n`);
    
    return totalPeople;
}

function validateArgs(args) {
    if (args.length < 2) {
        console.error('사용법:');
        console.error('  단일: node script.js <장소> <인원수> <날짜> [--schedule]');
        console.error('  다중: node script.js <인원수> <날짜1,날짜2> --all [--schedule] [--concurrent=N]');
        console.error('');
        console.error('옵션:');
        console.error('  --all              모든 장소 시도');
        console.error('  --schedule         스케줄링 모드');
        console.error('  --concurrent=N     동시 실행 (1-50, 기본값: 15)');
        console.error('');
        console.error('예시:');
        console.error('  node script.js 6 2026-02-23,2026-02-24 --all --concurrent=20');
        return false;
    }
    return true;
}

function validateDate(date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(date);
}

// 브라우저 풀 관리
async function getBrowser() {
    // 풀에 사용 가능한 브라우저가 있으면 반환
    if (browserPool.length > 0) {
        return browserPool.pop();
    }
    
    // 풀이 비어있으면 새로 생성
    activeBrowsers++;
    const browser = await puppeteer.launch({
        headless: 'new', // 새로운 headless 모드 (더 빠름)
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-sandbox',
            '--no-zygote',
            '--single-process',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-default-browser-check',
            '--safebrowsing-disable-auto-update',
        ]
    });
    
    return browser;
}

async function releaseBrowser(browser) {
    // 풀이 가득 차지 않았으면 반환
    if (browserPool.length < CONFIG.browserPoolSize) {
        browserPool.push(browser);
    } else {
        // 풀이 가득 찼으면 종료
        try {
            await browser.close();
        } catch (e) {
            if (browser.process()) {
                browser.process().kill('SIGINT');
            }
        }
        activeBrowsers--;
    }
}

// 리소스 차단 설정
async function setupResourceBlocking(page) {
    if (!CONFIG.blockResources) return;
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // HTML, Script, XHR만 허용, 나머지는 차단
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
}

// 단일 예약 함수 (최적화)
const runSingleReservation = async (place, numPeople, date) => {
    const queryStr = PLACE_QUERIES[place];
    const pageUrl = `${CONFIG.baseUrl}${queryStr}`;

    let browser;
    let page;
    
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        
        // 리소스 차단 설정
        await setupResourceBlocking(page);
        
        // 타임아웃 설정
        page.setDefaultTimeout(CONFIG.pageTimeout);
        page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        
        // User-Agent 설정 (선택적, 봇 감지 회피)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 페이지 로드 (domcontentloaded로 빠르게)
        await page.goto(pageUrl, { 
            waitUntil: "domcontentloaded",
            timeout: CONFIG.navigationTimeout 
        });

        // 완전히 방이 없는 경우 체크
        const emptyPage = await page.$(".complete");
        if (emptyPage) {
            await page.close();
            await releaseBrowser(browser);
            return 'empty';
        }

        // 사용 가능한 날짜 목록 가져오기
        const timeArray = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#apply_join_time option'))
                .map(element => element.value)
        );

        const dateIndex = timeArray.findIndex(element => element === date);
        if (dateIndex === -1) {
            await page.close();
            await releaseBrowser(browser);
            return 'date_not_available';
        }

        // 날짜, 총 인원수, 방 설정을 한 번에 처리
        await page.evaluate((selectedDate, selectedNum, numRooms, peoplePerRoom) => {
            document.querySelector('#apply_join_time').value = selectedDate;
            document.querySelector('#apply_stay_persons').value = selectedNum;
            
            const houseSelect = document.querySelector('#house_select');
            if (houseSelect) {
                houseSelect.value = numRooms.toString();
                houseSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, date, numPeople, CONFIG.numRooms, CONFIG.peoplePerRoom);

        // 방 입력 필드 대기 (최대 2초)
        await page.waitForFunction(
            (numRooms) => document.querySelector(`#apply_hope_room${numRooms}`) !== null,
            { timeout: 2000 },
            CONFIG.numRooms
        ).catch(() => {});

        // 각 방 인원수 입력
        await page.evaluate((numRooms, peoplePerRoom) => {
            for (let i = 0; i < numRooms; i++) {
                const roomInput = document.querySelector(`#apply_hope_room${i + 1}`);
                if (roomInput) {
                    roomInput.value = peoplePerRoom[i].toString();
                    roomInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }, CONFIG.numRooms, CONFIG.peoplePerRoom);

        // 검색 버튼 클릭
        await page.click('.button-primary');

        // 결과 대기
        try {
            await page.waitForSelector('#test', { timeout: 3000 });
        } catch {
            await page.close();
            await releaseBrowser(browser);
            return 'no_rooms';
        }
        
        // 방 선택 (최적화)
        const selectionResult = await page.evaluate((numRooms, peoplePerRoom) => {
            const rows = document.querySelectorAll("#coma_search_result tbody tr");
            const selected = [];
            
            for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
                const requiredCapacity = peoplePerRoom[roomIndex];
                let roomFound = false;
                
                for (const row of rows) {
                    const checkbox = row.querySelector('input[type=checkbox]');
                    if (!checkbox || checkbox.checked) continue;
                    
                    const roomNumberCell = row.cells[1];
                    const roomNumber = roomNumberCell ? roomNumberCell.textContent.trim() : '';
                    
                    const capacityCell = row.cells[4];
                    if (capacityCell) {
                        const capacityText = capacityCell.textContent.trim();
                        const capacity = capacityText.match(/(\d+)\s*～\s*(\d+)/);
                        
                        if (capacity) {
                            const minCapacity = parseInt(capacity[1]);
                            const maxCapacity = parseInt(capacity[2]);
                            
                            if (minCapacity <= requiredCapacity && requiredCapacity <= maxCapacity) {
                                checkbox.checked = true;
                                selected.push({
                                    index: roomIndex + 1,
                                    roomNumber: roomNumber,
                                    capacity: `${minCapacity}~${maxCapacity}`,
                                    people: requiredCapacity
                                });
                                roomFound = true;
                                break;
                            }
                        }
                    }
                }
                
                if (!roomFound) {
                    for (const row of rows) {
                        const checkbox = row.querySelector('input[type=checkbox]');
                        if (!checkbox || checkbox.checked) continue;
                        
                        const roomNumberCell = row.cells[1];
                        const roomNumber = roomNumberCell ? roomNumberCell.textContent.trim() : '';
                        const capacityCell = row.cells[4];
                        const capacityText = capacityCell ? capacityCell.textContent.trim() : '';
                        
                        checkbox.checked = true;
                        selected.push({
                            index: roomIndex + 1,
                            roomNumber: roomNumber,
                            capacity: capacityText,
                            people: requiredCapacity,
                            fallback: true
                        });
                        break;
                    }
                }
            }
            
            return {
                totalAvailable: rows.length,
                selected: selected
            };
        }, CONFIG.numRooms, CONFIG.peoplePerRoom);
        
        if (selectionResult.selected.length < CONFIG.numRooms) {
            await page.close();
            await releaseBrowser(browser);
            return 'insufficient_rooms';
        }

        // 폼 제출
        await page.$eval('#new_apply', form => form.submit());
        await page.waitForNavigation({ timeout: CONFIG.navigationTimeout });

        await page.click('.button-select');
        await page.waitForNavigation({ timeout: CONFIG.navigationTimeout });

        // 이메일 입력
        await page.evaluate((email) => {
            document.querySelector('#email_inp').value = email;
        }, CONFIG.emailAddr);

        // 다이얼로그 처리
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        await page.click('.button-primary');

        await page.close();
        await releaseBrowser(browser);
        return 'success';

    } catch (error) {
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (browser) {
            await releaseBrowser(browser);
        }
        return 'error';
    }
};

// 모든 장소/날짜 조합 생성
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

// 병렬 예약 실행
async function runParallelReservation(place, numPeople, date, semaphore, startTime) {
    await semaphore.acquire();
    
    try {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsedTime}s] 🚀 ${place} - ${date}`);
        
        const result = await runSingleReservation(place, numPeople, date);
        const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const resultMessages = {
            'success': `✅ ${place} - ${date} 성공!`,
            'empty': `❌ ${place} - ${date} 만실`,
            'date_not_available': `❌ ${place} - ${date} 날짜없음`,
            'no_rooms': `❌ ${place} - ${date} 방없음`,
            'insufficient_rooms': `❌ ${place} - ${date} 방부족`,
            'error': `⚠️ ${place} - ${date} 오류`
        };
        
        console.log(`[${finalTime}s] ${resultMessages[result]}`);
        
        return { place, date, numPeople, result, executionTime: finalTime };
    } finally {
        semaphore.release();
    }
}

// 다중 예약 실행
async function runMultipleReservations(numPeople, dates, concurrent = 15) {
    const combinations = generateCombinations(numPeople, dates);
    const semaphore = new Semaphore(concurrent);
    const startTime = Date.now();
    
    console.log(`🚀 총 ${combinations.length}개 조합 시도 (동시 ${concurrent}개)\n`);
    
    const promises = combinations.map(({ place, numPeople: num, date }) => 
        runParallelReservation(place, num, date, semaphore, startTime)
    );
    
    const results = await Promise.allSettled(promises);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const successResults = [];
    const failedResults = [];
    
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const { place, date, numPeople: num, result: reservationResult } = result.value;
            
            if (reservationResult === 'success') {
                successResults.push({ place, date, numPeople: num });
            } else {
                failedResults.push({ place, date, numPeople: num, reason: reservationResult });
            }
        } else {
            const { place, date, numPeople: num } = combinations[index];
            failedResults.push({ place, date, numPeople: num, reason: 'promise_rejected' });
        }
    });
    
    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log(`⏱️  총 ${totalTime}초 | 성공 ${successResults.length} | 실패 ${failedResults.length}`);
    
    if (successResults.length > 0) {
        console.log('\n🎉 성공:');
        successResults.forEach((res, i) => {
            console.log(`  ${i + 1}. ${res.place} - ${res.date}`);
        });
    }
    
    if (failedResults.length > 0) {
        const failureStats = {};
        failedResults.forEach(res => {
            failureStats[res.reason] = (failureStats[res.reason] || 0) + 1;
        });
        
        console.log('\n📋 실패 통계:');
        Object.entries(failureStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([reason, count]) => {
                const reasonTexts = {
                    'empty': '만실',
                    'date_not_available': '날짜없음',
                    'no_rooms': '방없음',
                    'insufficient_rooms': '방부족',
                    'error': '오류',
                };
                console.log(`  ${reasonTexts[reason] || reason}: ${count}건`);
            });
    }
    
    console.log('='.repeat(60));
    
    // 브라우저 풀 정리
    await cleanupBrowserPool();
    
    successfulReservations.push(...successResults);
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

// 브라우저 풀 정리
async function cleanupBrowserPool() {
    console.log('\n브라우저 풀 정리 중...');
    for (const browser of browserPool) {
        try {
            await browser.close();
        } catch (e) {
            if (browser.process()) {
                browser.process().kill('SIGINT');
            }
        }
    }
    browserPool = [];
    activeBrowsers = 0;
}

// 메인 실행 로직
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (!validateArgs(args)) {
        process.exit(1);
    }
    
    try {
        validateConfig();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    
    const hasAll = args.includes('--all');
    
    if (hasAll) {
        const numPeople = args[0];
        const datesStr = args[1];
        
        if (isNaN(numPeople) || parseInt(numPeople) <= 0) {
            console.error('❌ 인원수는 양의 정수여야 합니다.');
            process.exit(1);
        }
        
        const dates = datesStr.split(',').map(d => d.trim());
        
        for (const date of dates) {
            if (!validateDate(date)) {
                console.error(`❌ 잘못된 날짜 형식: ${date}`);
                process.exit(1);
            }
        }
        
        let concurrent = 15;
        const concurrentArg = args.find(arg => arg.startsWith('--concurrent='));
        if (concurrentArg) {
            const concurrentValue = parseInt(concurrentArg.split('=')[1]);
            if (concurrentValue > 0 && concurrentValue <= 50) {
                concurrent = concurrentValue;
            }
        }
        
        runMultipleReservations(numPeople, dates, concurrent).then(() => {
            process.exit(0);
        }).catch(error => {
            console.error('❌ 오류:', error);
            process.exit(1);
        });
        
    } else {
        const [place, numPeople, date] = args;
        
        if (!PLACE_QUERIES[place]) {
            console.error(`❌ 지원하지 않는 장소: ${place}`);
            process.exit(1);
        }
        
        if (isNaN(numPeople) || parseInt(numPeople) <= 0) {
            console.error('❌ 인원수는 양의 정수여야 합니다.');
            process.exit(1);
        }
        
        if (!validateDate(date)) {
            console.error('❌ 날짜 형식 오류');
            process.exit(1);
        }
        
        runSingleReservation(place, numPeople, date).then(async result => {
            console.log(`\n결과: ${result}`);
            await cleanupBrowserPool();
            process.exit(result === 'success' ? 0 : 1);
        });
    }
}

module.exports = { 
    runSingleReservation, 
    runMultipleReservations,
    cleanupBrowserPool
};
