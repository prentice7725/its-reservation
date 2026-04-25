// Playwright 버전 - 더 빠른 브라우저 자동화
// 설치: npm install playwright
const { chromium } = require('playwright');

// 장소별 쿼리 스트링 매핑
const PLACE_QUERIES = {
    alivila: "PWNUTTBJVFBrbG1KbFZuYzAxVFp5Vkhkd0YyWWZWR2JuOTJiblpTWjFKSGQ5a0hkdzFXWg%3D%3D"
};

const CONFIG = {
    baseUrl: "https://as.its-kenpo.or.jp/apply/empty_new?s=",
    emailAddr: 'midgart@naver.com',
    numRooms: 1,
    peoplePerRoom: [3],
    
    // 성능 최적화 설정
    pageTimeout: 10000,       // 더 짧은 타임아웃
    navigationTimeout: 5000,
    browserContexts: 5,       // 컨텍스트 풀 크기
    blockResources: true,
};

// 브라우저 및 컨텍스트 풀
let browser = null;
let contextPool = [];
let successfulReservations = [];

// 설정 검증
function validateConfig() {
    if (CONFIG.peoplePerRoom.length !== CONFIG.numRooms) {
        throw new Error(`❌ 방 개수와 인원수 배열 길이 불일치`);
    }
    
    const totalPeople = CONFIG.peoplePerRoom.reduce((a, b) => a + b, 0);
    console.log('✓ 설정:');
    console.log(`  - ${CONFIG.numRooms}개 방 (${CONFIG.peoplePerRoom.join(', ')}명)`);
    console.log(`  - 총 ${totalPeople}명`);
    console.log(`  - 컨텍스트 풀: ${CONFIG.browserContexts}개`);
    console.log(`  - 리소스 차단: ${CONFIG.blockResources}\n`);
    
    return totalPeople;
}

function validateArgs(args) {
    if (args.length === 0) {
        console.log('사용법:');
        console.log('  테스트 모드: node reservation_playwright.js test blueberry 6 2026-02-25');
        console.log('  단일 장소:   node reservation_playwright.js blueberry 6 2026-02-25');
        console.log('  전체 장소:   node reservation_playwright.js 6 2026-02-25 --all --concurrent=30');
        console.log('  여러 날짜:   node reservation_playwright.js 6 2026-02-25,2026-02-26 --all --concurrent=30');
        console.log('\n사용 가능한 장소:');
        console.log('  ' + Object.keys(PLACE_QUERIES).join(', '));
        return false;
    }
    
    // test 모드 또는 단일 장소 모드
    if (args[0] === 'test' || PLACE_QUERIES[args[0]]) {
        if (args.length < 3) {
            console.error('❌ 단일 모드는 3개 인자 필요: [장소] [인원수] [날짜]');
            return false;
        }
        return true;
    }
    
    // 전체 모드
    if (args.includes('--all')) {
        if (args.length < 2) {
            console.error('❌ 전체 모드는 최소 2개 인자 필요: [인원수] [날짜] --all');
            return false;
        }
        return true;
    }
    
    console.error('❌ 잘못된 사용법');
    console.log('사용법:');
    console.log('  테스트: node reservation_playwright.js test blueberry 6 2026-02-25');
    console.log('  전체:   node reservation_playwright.js 6 2026-02-25 --all');
    return false;
}

function validateDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

// 브라우저 초기화
async function initBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
            ]
        });
        console.log('✓ 브라우저 시작됨\n');
    }
    return browser;
}

// 컨텍스트 가져오기
async function getContext() {
    if (contextPool.length > 0) {
        return contextPool.pop();
    }
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    // 리소스 차단
    if (CONFIG.blockResources) {
        await context.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });
    }
    
    return context;
}

async function releaseContext(context) {
    if (contextPool.length < CONFIG.browserContexts) {
        // 모든 페이지 닫기
        const pages = context.pages();
        for (const page of pages) {
            await page.close().catch(() => {});
        }
        contextPool.push(context);
    } else {
        await context.close().catch(() => {});
    }
}

// 단일 예약 함수 (Playwright 최적화)
const runSingleReservation = async (place, numPeople, date) => {
    const queryStr = PLACE_QUERIES[place];
    const pageUrl = `${CONFIG.baseUrl}${queryStr}`;

    let context;
    let page;
    
    try {
        context = await getContext();
        page = await context.newPage();
        
        // 타임아웃 설정
        page.setDefaultTimeout(CONFIG.pageTimeout);
        page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
        
        // 페이지 로드
        await page.goto(pageUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.navigationTimeout 
        });

        // 방이 없는 경우
        if (await page.locator(".complete").count() > 0) {
            await releaseContext(context);
            return 'empty';
        }

        // 날짜 확인
        const timeArray = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#apply_join_time option'))
                .map(element => element.value)
        );

        if (!timeArray.includes(date)) {
            await releaseContext(context);
            return 'date_not_available';
        }

        // 폼 입력 (한 번에)
        await page.evaluate(([selectedDate, selectedNum, numRooms, peoplePerRoom]) => {
            document.querySelector('#apply_join_time').value = selectedDate;
            document.querySelector('#apply_stay_persons').value = selectedNum;
            
            const houseSelect = document.querySelector('#house_select');
            if (houseSelect) {
                houseSelect.value = numRooms.toString();
                houseSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, [date, numPeople, CONFIG.numRooms, CONFIG.peoplePerRoom]);

        // 방 입력 필드 대기 (Playwright는 자동 재시도)
        await page.waitForSelector(`#apply_hope_room${CONFIG.numRooms}`, { 
            timeout: 2000 
        }).catch(() => {});

        // 각 방 인원수 입력
        await page.evaluate(([numRooms, peoplePerRoom]) => {
            for (let i = 0; i < numRooms; i++) {
                const roomInput = document.querySelector(`#apply_hope_room${i + 1}`);
                if (roomInput) {
                    roomInput.value = peoplePerRoom[i].toString();
                    roomInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }, [CONFIG.numRooms, CONFIG.peoplePerRoom]);

        // 검색
        await page.click('.button-primary');

        // 결과 대기
        try {
            await page.waitForSelector('#test', { timeout: 3000 });
        } catch {
            await releaseContext(context);
            return 'no_rooms';
        }
        
        // 방 선택
        const selectionResult = await page.evaluate(([numRooms, peoplePerRoom]) => {
            const rows = document.querySelectorAll("#coma_search_result tbody tr");
            const selected = [];
            
            for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
                const requiredCapacity = peoplePerRoom[roomIndex];
                let roomFound = false;
                
                for (const row of rows) {
                    const checkbox = row.querySelector('input[type=checkbox]');
                    if (!checkbox || checkbox.checked) continue;
                    
                    const capacityCell = row.cells[4];
                    if (capacityCell) {
                        const capacity = capacityCell.textContent.trim().match(/(\d+)\s*～\s*(\d+)/);
                        
                        if (capacity) {
                            const minCapacity = parseInt(capacity[1]);
                            const maxCapacity = parseInt(capacity[2]);
                            
                            if (minCapacity <= requiredCapacity && requiredCapacity <= maxCapacity) {
                                checkbox.checked = true;
                                selected.push(true);
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
                        checkbox.checked = true;
                        selected.push(true);
                        break;
                    }
                }
            }
            
            return selected.length;
        }, [CONFIG.numRooms, CONFIG.peoplePerRoom]);
        
        if (selectionResult < CONFIG.numRooms) {
            await releaseContext(context);
            return 'insufficient_rooms';
        }

        // 폼 제출
        await page.evaluate(() => {
            document.querySelector('#new_apply').submit();
        });
        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.navigationTimeout });

        await page.click('.button-select');
        await page.waitForLoadState('domcontentloaded', { timeout: CONFIG.navigationTimeout });

        // 이메일
        await page.fill('#email_inp', CONFIG.emailAddr);

        // 다이얼로그 자동 수락
        page.on('dialog', dialog => dialog.accept());

        await page.click('.button-primary');

        await releaseContext(context);
        return 'success';

    } catch (error) {
        if (context) {
            await releaseContext(context);
        }
        return 'error';
    }
};

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

async function runParallelReservation(place, numPeople, date, semaphore, startTime) {
    await semaphore.acquire();
    
    try {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed}s] 🚀 ${place}-${date}`);
        
        const result = await runSingleReservation(place, numPeople, date);
        const final = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const msgs = {
            'success': `✅ ${place}-${date} 성공!`,
            'empty': `❌ ${place}-${date} 만실`,
            'date_not_available': `❌ ${place}-${date} 날짜X`,
            'no_rooms': `❌ ${place}-${date} 방X`,
            'insufficient_rooms': `❌ ${place}-${date} 부족`,
            'error': `⚠️ ${place}-${date} 오류`
        };
        
        console.log(`[${final}s] ${msgs[result]}`);
        
        return { place, date, numPeople, result, executionTime: final };
    } finally {
        semaphore.release();
    }
}

async function runMultipleReservations(numPeople, dates, concurrent = 20) {
    await initBrowser();
    
    const combinations = generateCombinations(numPeople, dates);
    const semaphore = new Semaphore(concurrent);
    const startTime = Date.now();
    
    console.log(`🚀 ${combinations.length}개 조합 (동시 ${concurrent}개)\n`);
    
    const promises = combinations.map(({ place, numPeople: num, date }) => 
        runParallelReservation(place, num, date, semaphore, startTime)
    );
    
    const results = await Promise.allSettled(promises);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const successResults = [];
    const failedResults = [];
    
    results.forEach((result) => {
        if (result.status === 'fulfilled') {
            const { place, date, numPeople: num, result: res } = result.value;
            
            if (res === 'success') {
                successResults.push({ place, date, numPeople: num });
            } else {
                failedResults.push({ reason: res });
            }
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`⏱️ ${totalTime}초 | ✅ ${successResults.length} | ❌ ${failedResults.length}`);
    
    if (successResults.length > 0) {
        console.log('\n🎉 성공:');
        successResults.forEach((res, i) => {
            console.log(`  ${i + 1}. ${res.place} - ${res.date}`);
        });
    }
    
    if (failedResults.length > 0) {
        const stats = {};
        failedResults.forEach(res => {
            stats[res.reason] = (stats[res.reason] || 0) + 1;
        });
        
        console.log('\n📋 실패:');
        Object.entries(stats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([reason, count]) => {
                const texts = {
                    'empty': '만실',
                    'date_not_available': '날짜X',
                    'no_rooms': '방X',
                    'insufficient_rooms': '부족',
                    'error': '오류',
                };
                console.log(`  ${texts[reason] || reason}: ${count}`);
            });
    }
    
    console.log('='.repeat(60));
    
    await cleanup();
    
    successfulReservations.push(...successResults);
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

async function cleanup() {
    console.log('\n정리 중...');
    
    for (const context of contextPool) {
        await context.close().catch(() => {});
    }
    contextPool = [];
    
    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
    }
}

// 메인
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
    
    // 이메일 설정
    const emailArg = args.find(arg => arg.startsWith('--email='));
    if (emailArg) {
        CONFIG.emailAddr = emailArg.split('=')[1];
        console.log(`📧 이메일 설정: ${CONFIG.emailAddr}\n`);
    }
    
    const hasAll = args.includes('--all');
    const isTest = args[0] === 'test';
    
    if (hasAll) {
        const numPeople = args[0];
        const datesStr = args[1];
        
        if (isNaN(numPeople) || parseInt(numPeople) <= 0) {
            console.error('❌ 인원수 오류');
            process.exit(1);
        }
        
        const dates = datesStr.split(',').map(d => d.trim());
        
        for (const date of dates) {
            if (!validateDate(date)) {
                console.error(`❌ 날짜 오류: ${date}`);
                process.exit(1);
            }
        }
        
        let concurrent = 20;
        const concurrentArg = args.find(arg => arg.startsWith('--concurrent='));
        if (concurrentArg) {
            const val = parseInt(concurrentArg.split('=')[1]);
            if (val > 0 && val <= 100) {
                concurrent = val;
            }
        }
        
        runMultipleReservations(numPeople, dates, concurrent)
            .then(() => process.exit(0))
            .catch(error => {
                console.error('❌', error);
                cleanup().then(() => process.exit(1));
            });
        
    } else {
        // test 모드 또는 단일 장소 모드
        let place, numPeople, date;
        
        if (isTest) {
            // test 모드: node script.js test blueberry 6 2026-02-25
            [_, place, numPeople, date] = args;
            console.log('🧪 테스트 모드\n');
        } else {
            // 단일 모드: node script.js blueberry 6 2026-02-25
            [place, numPeople, date] = args;
        }
        
        if (!PLACE_QUERIES[place]) {
            console.error(`❌ 장소 오류: ${place}`);
            console.log('사용 가능한 장소:', Object.keys(PLACE_QUERIES).join(', '));
            process.exit(1);
        }
        
        if (!validateDate(date)) {
            console.error(`❌ 날짜 오류: ${date} (형식: YYYY-MM-DD)`);
            process.exit(1);
        }
        
        if (isNaN(numPeople) || parseInt(numPeople) <= 0) {
            console.error('❌ 인원수 오류');
            process.exit(1);
        }
        
        console.log(`📍 장소: ${place}`);
        console.log(`👥 인원: ${numPeople}명`);
        console.log(`📅 날짜: ${date}\n`);
        
        initBrowser().then(() => {
            return runSingleReservation(place, numPeople, date);
        }).then(async result => {
            console.log(`\n최종 결과: ${result}`);
            if (result === 'success') {
                console.log(`✅ 예약 신청 완료!`);
                console.log(`📧 ${CONFIG.emailAddr}로 메일을 확인하세요 (스팸함도 확인!)`);
            }
            await cleanup();
            process.exit(result === 'success' ? 0 : 1);
        }).catch(async error => {
            console.error('❌ 오류:', error);
            await cleanup();
            process.exit(1);
        });
    }
}

// Ctrl+C 처리
process.on('SIGINT', async () => {
    console.log('\n\n중단됨. 정리 중...');
    await cleanup();
    process.exit(0);
});

module.exports = { 
    runSingleReservation, 
    runMultipleReservations,
    cleanup
};
