import { chromium } from 'playwright';

const baseUrl = "https://as.its-kenpo.or.jp/apply/empty_new?s=";

// 브라우저 및 컨텍스트 풀
let browser = null;
let contextPool = [];

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
    }
    return browser;
}

// 컨텍스트 가져오기
async function getContext(blockResources = true) {
    if (contextPool.length > 0) {
        return contextPool.pop();
    }

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    if (blockResources) {
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

async function releaseContext(context, browserContexts = 5) {
    if (contextPool.length < browserContexts) {
        const pages = context.pages();
        for (const page of pages) {
            await page.close().catch(() => {});
        }
        contextPool.push(context);
    } else {
        await context.close().catch(() => {});
    }
}

// 메인 예약 함수
export async function runPlaywrightReservation(config, onLog = () => {}) {
    const { place, date, numPeople, emailAddr, numRooms, peoplePerRoom, pageTimeout = 10000, navigationTimeout = 5000, queryStringing, signal } = config;
    const queryString = queryStringing; // 변수명 통일

    const pageUrl = `${baseUrl}${queryString}`;

    let context;
    let page;
    let abortHandler;

    const throwIfAborted = () => {
        if (signal?.aborted) {
            throw new Error('Reservation cancelled');
        }
    };

    try {
        throwIfAborted();
        await initBrowser();
        context = await getContext();
        page = await context.newPage();

        abortHandler = () => {
            page?.close().catch(() => {});
            context?.close().catch(() => {});
        };
        signal?.addEventListener('abort', abortHandler, { once: true });

        page.setDefaultTimeout(pageTimeout);
        page.setDefaultNavigationTimeout(navigationTimeout);

        onLog('info', `[Playwright] ${place} - ${date} 시작`);

        // 페이지 로드
        throwIfAborted();
        await page.goto(pageUrl, {
            waitUntil: 'domcontentloaded',
            timeout: navigationTimeout
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

        // 폼 입력
        throwIfAborted();
        await page.evaluate(([selectedDate, selectedNum, selectedNumRooms, selectedPeoplePerRoom]) => {
            document.querySelector('#apply_join_time').value = selectedDate;
            document.querySelector('#apply_stay_persons').value = selectedNum;

            const houseSelect = document.querySelector('#house_select');
            if (houseSelect) {
                houseSelect.value = selectedNumRooms.toString();
                houseSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, [date, numPeople, numRooms, peoplePerRoom]);

        // 방 입력 필드 대기
        await page.waitForSelector(`#apply_hope_room${numRooms}`, {
            timeout: 2000
        }).catch(() => {});

        // 각 방 인원수 입력
        await page.evaluate(([selectedNumRooms, selectedPeoplePerRoom]) => {
            for (let i = 0; i < selectedNumRooms; i++) {
                const roomInput = document.querySelector(`#apply_hope_room${i + 1}`);
                if (roomInput) {
                    roomInput.value = selectedPeoplePerRoom[i].toString();
                    roomInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }, [numRooms, peoplePerRoom]);

        // 검색
        throwIfAborted();
        await page.click('.button-primary');

        // 결과 대기
        try {
            await page.waitForSelector('#test', { timeout: 3000 });
        } catch {
            await releaseContext(context);
            return 'no_rooms';
        }

        // 방 선택
        throwIfAborted();
        const selectionResult = await page.evaluate(([selectedNumRooms, selectedPeoplePerRoom]) => {
            const rows = document.querySelectorAll("#coma_search_result tbody tr");
            const selected = [];

            for (let roomIndex = 0; roomIndex < selectedNumRooms; roomIndex++) {
                const requiredCapacity = selectedPeoplePerRoom[roomIndex];
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
        }, [numRooms, peoplePerRoom]);

        if (selectionResult < numRooms) {
            await releaseContext(context);
            return 'insufficient_rooms';
        }

        // 폼 제출
        throwIfAborted();
        await page.evaluate(() => {
            document.querySelector('#new_apply').submit();
        });
        await page.waitForLoadState('domcontentloaded', { timeout: navigationTimeout });

        throwIfAborted();
        await page.click('.button-select');
        await page.waitForLoadState('domcontentloaded', { timeout: navigationTimeout });

        // 이메일
        throwIfAborted();
        await page.fill('#email_inp', emailAddr);

        // 다이얼로그 자동 수락
        page.on('dialog', dialog => dialog.accept());

        throwIfAborted();
        await page.click('.button-primary');

        await releaseContext(context);
        signal?.removeEventListener('abort', abortHandler);

        onLog('info', `  ✅ 성공!`);
        return 'success';

    } catch (error) {
        if (signal?.aborted || error.message === 'Reservation cancelled') {
            onLog('warning', `  중단됨: ${place} - ${date}`);
            if (context) {
                await context.close().catch(() => {});
            }
            signal?.removeEventListener('abort', abortHandler);
            return 'cancelled';
        }

        onLog('error', `  ⚠️ Playwright 오류: ${error.message}`);
        if (context) {
            await releaseContext(context);
        }
        signal?.removeEventListener('abort', abortHandler);
        return 'error';
    }
}

// 정리
export async function cleanup() {
    for (const context of contextPool) {
        await context.close().catch(() => {});
    }
    contextPool = [];

    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
    }
}
