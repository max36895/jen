const STORAGE_KEY = 'JeN_Storage-data';
const VERSION = 1;

export interface IStorageData {
    /**
     * Статус запроса для ветки
     */
    status: 'processing' | 'empty';
    /**
     * Состояние ветки
     */
    branchState?: 'fail' | 'process' | 'success' | 'empty';

    /**
     * Текущее состояние процесса
     */
    progressValue?: string;
    /**
     * Пытались ли мы угадать ветку
     */
    isAutoRep?: boolean;
    /**
     * Название ветки
     */
    branchName?: string;
    /**
     * Название репозитория
     */
    rep?: string;
    /**
     * Ссылка на ветку
     */
    link?: string;
}

export interface IStorage {
    items: IStorageData;
    customBranches: string[];
    version: number;
}

type StorageData = Record<string, IStorageData>;
type TEventName = 'create' | 'remove' | 'update';

const subscribers: Record<TEventName, ((name: string, data: Partial<IStorageData>, oldData?: Partial<IStorageData>) => void)[]> = {
    create: [],
    remove: [],
    update: []
};

/*
let intervalId: NodeJS.Timeout = null;
let oldLocalStorage: string = '{}';
*/

export class Storage {
    static clear(): void {
        const data = Storage.getFull();
        localStorage.removeItem(STORAGE_KEY);
        Object.keys(data).forEach((key) => {
            this.send('remove', key);
        });
    }

    static getKey(key: string, rep: string): string {
        if (!key) {
            return key;
        }
        // На случай, если key указали в приводимом для нас виде
        if (key.match(/\[[^\]]+]:/)) {
            return key;
        }
        if (rep) {
            return `[${rep}]:${key}`;
        }
        return key;
    }

    static setEmptyStatus(): void {
        const data = Storage.getFull();
        for (const key in data) {
            data[key].status = 'empty';
            data[key].branchState = 'empty';
        }
        this.save(data);
    }

    static formatData(): void {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as IStorage;
        if (data.version !== VERSION) {
            if (!data.version || !data.items) {
                const items = {items: data, version: VERSION};
                Object.keys(data).forEach((key) => {
                    items.items[key].branchName = key;
                    items.items[this.getKey(key, items.items[key].rep)] = items.items[key];
                    delete items.items[key]; // удаляем старые данные
                })
                localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            } else {
                // обработка для новой версии.
            }
        }
    }

    static getFull(): StorageData {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').items || {};
    }

    static getItem(key: string): IStorageData {
        const data = Storage.getFull();
        let res = data[key];
        if (res) {
            return res;
        }
        Object.keys(data).forEach((keyName) => {
            if (data[keyName].branchName === key) {
                res = data[keyName];
            }
        });
        return res;
    }

    static add(key: string, value: IStorageData, sendSubscribers: boolean = true): void {
        const data = Storage.getFull();
        const correctKey = this.getKey(key, value.rep);
        // чистим имя ветки на всякий случай
        value.branchName = key.trim().replace(/(\[[^\]]+]:)/, '');
        data[correctKey] = value;
        this.save(data);
        if (sendSubscribers) {
            this.send('create', value.branchName, value);
        }
    }

    static update(key: string, value: Partial<IStorageData>, sendSubscribers: boolean = true): void {
        const data = Storage.getFull();
        const correctKey = this.getKey(key, value.rep || this.getItem(key)?.rep);
        const oldData = data[correctKey] || data[key];
        if (oldData?.rep !== value.rep) {
            this.remove(key, sendSubscribers);
            // Если есть свойство rep, и оно пустое, то добавляем ветку по переданному ключу, в противном случае по нужному
            if (value.hasOwnProperty('rep') && !value.rep) {
                this.add(key, {...oldData, ...value}, sendSubscribers);
            } else {
                this.add(correctKey, {...oldData, ...value}, sendSubscribers);
            }
            return;
        } else {
            // Записываем только в том случае, если запись уже есть. Иначе получим ерунду
            if (data[correctKey]) {
                data[correctKey] = {...oldData, ...value};
            }
        }
        this.save(data);
        if (sendSubscribers) {
            this.send('update', correctKey, data[correctKey], oldData);
        }
    }

    static remove(key: string, sendSubscribers: boolean = true): void {
        const data = Storage.getFull();
        let correctKey = key;
        if (data[key]) {
            delete data[key];
        } else {
            Object.keys(data).forEach((keyName) => {
                if (data[keyName].branchName === key.replace(/(\[[^\]]+]:)/, '')) {
                    delete data[keyName];
                    correctKey = keyName;
                }
            })
        }
        this.save(data);
        if (sendSubscribers) {
            this.send('remove', correctKey, data[correctKey]);
        }
    }

    static getCustomBranches(): string[] {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return data.customBranches || [];
    }

    static addCustomBranches(name: string): void {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const customBranches = data.customBranches || [];
        if (!customBranches.includes(name)) {
            customBranches.push(name);
            data.customBranches = customBranches;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    }

    static removeCustomBranches(name: string): void {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const customBranches = data.customBranches || [];
        if (customBranches.includes(name)) {
            customBranches.splice(customBranches.indexOf(name), 1);
            data.customBranches = customBranches;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    }

    private static save(items: StorageData) {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        data.items = items;
        data.version = VERSION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    private static send(
        name: TEventName,
        key: string,
        thisData?: Partial<IStorageData>, oldData?: Partial<IStorageData>
    ) {
        if (subscribers[name].length) {
            subscribers[name].forEach(callback => callback(key, thisData, oldData));
        }
    }

    /**
     * Применять в том случае, когда скрипт сможет заработать на сайте, чтобы корректно следить за состоянием хранилища
     * Либо сделать через события, чтобы фоновый скрипт слушал тот что от окна расширения.
     * @private
     */
    private static sendSubscribers() {
        // Нет корректного способа подписаться на изменения хранилища,
        // поэтому делаем это через setInterval
        /*if (intervalId) {
            clearInterval(intervalId);
        }
        intervalId = setInterval(() => {
            if (!subscribers.create.length && !subscribers.remove.length) {
                clearInterval(intervalId);
            } else {
                if (localStorage.getItem(STORAGE_KEY) !== oldLocalStorage) {
                    const thisData = Storage.getFull();
                    const oldData = JSON.parse(oldLocalStorage).items;
                    const thisKeys = Object.keys(thisData);
                    const oldKeys = Object.keys(oldData);
                    thisKeys.forEach(key => {
                        if (oldKeys.includes(key)) {
                            delete thisData[key];
                            delete oldData[key];
                        }
                    });
                    Object.keys(thisData).forEach(key => {
                        this.send('create', key, thisData[key]);
                    })
                    Object.keys(oldData).forEach(key => {
                        this.send('remove', key, oldData[key]);
                    })

                    oldLocalStorage = localStorage.getItem(STORAGE_KEY);
                }
            }
        }, 10000);*/
    }

    static subscribe(
        name: TEventName,
        callback: (key: string, thisData: IStorageData, oldData?: IStorageData) => void
    ) {
        subscribers[name].push(callback);
        // this.sendSubscribers();
    }
}