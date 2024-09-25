import { IStorageData, Storage } from './Storage';

interface IBranchInfo {
    status: 'processing' | 'error' | 'success' | 'fail';
    rep?: string;
    progressValue?: string;
    title?: string;
    body?: string;
    href?: string;
}

const REP_MAP = {
    wasaby_controls: 'engine',
    engine: 'wasaby_controls'
};

function sendNotification(msg) {
    console.log(msg);
    // todo Надо что-то придумать!!!
    /*
    if ('Notification' in window) {
        const cb = () => {
            Notification.requestPermission((permission) => {
                if (permission === 'granted') {
                    const notification = new Notification('Ветка ' + msg.title + ' прошла тесты!', {
                        body: msg.boby,
                        icon: 'https://www.sbis.ru/favicon.ico'
                    });
                    if (msg.href) {
                        notification.onclick = () => {
                            window.open(msg.href);
                        }
                    }
                }
            });
        };
        if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(() => {
                cb();
            });
        } else {
            cb();
        }
    }
    */
}

const intervals = [];

async function branchInfo(name: string, rep?: string): Promise<IBranchInfo> {
    const branchRep = rep || 'wasaby_controls';
    const branchName = encodeURI(name).replace(/\//g, '%2F');
    let branch = name.match(/\b\d{2}\.\d{2}/)?.[0];
    if (branch) {
        // Если правки в хф, то название ветки должно быть от основной
        branch += '00';
        const link = `http://ci-platform.sbis.ru/job/branch_${branchRep}_${branch}/job/${branchName}/`;
        try {
            const response = await fetch(
                `${link}buildHistory/ajax`,
                {
                    headers: {
                        accept: 'text/javascript, text/html, application/xml, text/xml, */*',
                        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                        'cache-control': 'no-cache',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        pragma: 'no-cache',
                        'x-prototype-version': '1.7',
                        'x-requested-with': 'XMLHttpRequest'
                    },
                    referrerPolicy: 'same-origin',
                    body: '',
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include'
                }
            );

            if (response.ok) {
                Storage.update(Storage.getKey(name, rep), {link, rep: branchRep});
                const blob = await response.blob();
                const textResult = await blob.text();
                const el = document.createElement('div');
                el.innerHTML = textResult;
                // Если есть класс progress-bar-done, значит тесты еще не закончились
                if (el.querySelectorAll('.progress-bar-done').length ||
                    el.querySelectorAll('.progress-bar').length) {
                    return {
                        status: 'processing',
                        rep: branchRep,
                        progressValue: (el.querySelector('.progress-bar-done') as HTMLElement)?.style?.width || ''
                    };
                }
                // На всякий случай, если с версткой что-то не то (кривой ответ либо хз что еще)
                if (!el.querySelectorAll('a')?.[1]?.textContent) {
                    return {
                        status: 'error',
                        title: 'Не удалось получить информацию о ветке'
                    };
                }
                // Если в названии есть что-то кроме ветки, то скорей всего упала ошибка
                // build-status-icon__wrapper.icon-blue - все ок
                const status = el.querySelectorAll('.build-status-icon__wrapper')?.[0]?.className?.includes('icon-blue');
                if (!status) {
                    return {
                        status: 'fail',
                        title: `Тесты по ветке ${name} упали!`,
                        body:
                            el.querySelectorAll('a')[1].textContent +
                            '\n ссылка:' +
                            el.querySelectorAll('a')[1].href,
                        href: el.querySelectorAll('a')[1].href
                    };
                }
                return {status: 'success', title: `Тесты по ветке ${name} прошли успешно!`};
            } else {
                throw new Error('404');
            }
        } catch (err) {
            // Если ошибка 404, то попытаемся получить информацию о ветке в другом репозитории
            if (err.message === '404') {
                if (!rep) {
                    const correctRep = REP_MAP[branchRep];
                    if (correctRep) {
                        Storage.update(Storage.getKey(name, rep), {rep: correctRep, isAutoRep: true});
                        return branchInfo(name, correctRep);
                    }
                    return {
                        status: 'error',
                        title: 'Не удалось получить информацию о ветке'
                    };
                } else {
                    if (Storage.getItem(Storage.getKey(name, rep)).isAutoRep) {
                        Storage.update(name, {rep: undefined, isAutoRep: false}, false);
                    }
                }
            }
            return {
                status: 'error',
                title: err.message
            }
        }
    }
    return Promise.resolve({
        status: 'error',
        title: 'Не удалось получить информацию о ветке'
    });
}

function updateState(branchName: string, result: IBranchInfo) {
    switch (result.status) {
        case 'processing':
            Storage.update(branchName, {branchState: 'process', progressValue: result.progressValue});
            break;
        case 'success':
            // хз стоит ли удалять, вроде как лучше оставлять и пусть сами все удаляют
            // Storage.remove(branchName);
            Storage.update(branchName, {branchState: 'success'});
            // sendNotification(result);
            break;
        case 'fail':
            Storage.update(branchName, {branchState: 'fail'});
            // sendNotification(result);
            break;
        default:
            Storage.update(branchName, {branchState: 'empty'});
            break;
    }
}

function getInfo(branchName: string, branchRep?: string) {
    const fn = async () => {
        let isProcessing = false;
        let repName = branchRep;
        try {
            isProcessing = true
            const resultBase = await branchInfo(branchName, repName);
            isProcessing = false;
            repName = resultBase?.rep || branchRep;
            updateState(Storage.getKey(branchName, repName), resultBase);
            if (resultBase.status === 'processing') {
                const timeInterval = setInterval(async () => {
                    if (!isProcessing) {
                        isProcessing = true;
                        const resultInterval = await branchInfo(branchName, repName);
                        repName = resultInterval?.rep;
                        isProcessing = false;
                        updateState(Storage.getKey(branchName, repName), resultInterval);
                        if (resultInterval.status !== 'processing') {
                            sendNotification(resultInterval);
                            clearInterval(timeInterval);
                            intervals.splice(intervals.indexOf(timeInterval), 1);
                        }
                    }
                }, 60000);
                intervals.push(timeInterval);
            }
        } catch (err) {
            sendNotification({
                title: 'Произошла ошибка!',
                body: err.message
            });
        }
    };
    fn();
}

export function processing(name: string, data: IStorageData, force?: boolean) {
    // Если где-то ветка запустилась, то не трогаем ее
    if (Storage.getItem(name).status === 'empty' || force) {
        Storage.update(Storage.getKey(name, data?.rep), {...data, status: 'processing'});
        getInfo(data?.branchName, data?.rep);
    }
}

export function init(force?: boolean) {
    /*if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }*/
    const data = Storage.getFull();
    intervals.forEach((interval) => clearInterval(interval));
    intervals.splice(0, intervals.length);
    Object.keys(data).forEach((name) => {
        if (data[name].branchName) {
            processing(data[name].branchName, data[name], force);
        }
    });
}