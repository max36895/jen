import { IStorageData, Storage } from './Storage';
import { init, processing } from "./BranchInfo";

const eventCbs = {}

function removeBranch(name: string) {
    const block = document.getElementById('branchList');
    const element = document.getElementById(name);
    if (element) {
        if (eventCbs[name]) {
            element.removeEventListener('click', eventCbs[name]);
            delete eventCbs[name];
        }
        block.removeChild(element);
    }
}

function addItemInList(name: string, rep?: string, progressValue?: string) {
    const sData = Storage.getItem(Storage.getKey(name, rep));
    if (sData) {
        const block = document.getElementById('branchList');
        const element = document.createElement('li');
        const buttonId = `remove-${rep}-${name}`;
        element.id = Storage.getKey(name, rep);
        element.className = `branchItem branchItem_status-${sData.branchState}`;
        element.style.setProperty('--progress-value', progressValue)
        let repPrefix: string;
        switch (rep) {
            case 'engine':
                repPrefix = 'engine';
                break;
            case 'wasaby_controls':
                repPrefix = 'wc';
                break;
            default:
                repPrefix = '?';
                break;
        }
        element.innerHTML = `<span class="branchItem__name" title="${name} реп: ${rep}">[${repPrefix}]: ${name}</span><button id="${buttonId}">x</button>`;
        block.appendChild(element);
        const clickCb = (event: Event) => {
            if (event.target && (event.target as HTMLButtonElement).id === buttonId) {
                // removeBranch(name);
                Storage.remove(Storage.getKey(name, rep));
                return;
            }
            // На всякий, случай, а то состояние или ссылка могли обновиться
            const item = Storage.getItem(Storage.getKey(name, rep));
            if (item && item.link) {
                window.open(item.link, '_blank');
            }
        };
        eventCbs[name] = clickCb;
        element.addEventListener('click', clickCb);
    }
}

function addBranch() {
    const input: HTMLInputElement = document.getElementById('branchName') as HTMLInputElement;
    if (input) {
        const inputValue = input.value?.trim?.();
        if (inputValue) {
            let isAdded = false;
            const item = Storage.getItem(inputValue);
            const isBranchEqual = document.getElementById('isBranchEqual') as HTMLInputElement;
            const isCustomBranch = document.getElementById('isCustomBranch') as HTMLInputElement;
            if (item) {
                if (isBranchEqual?.checked) {
                    // Если стоит галка для работы 2 репами, то на всякий случай, удаляем предыдущие
                    Storage.remove(Storage.getKey(inputValue, 'engine'));
                    Storage.remove(Storage.getKey(inputValue, 'wasaby_controls'));
                    isAdded = true;
                } else {
                    if (isCustomBranch?.checked) {
                        const customBranchName = document.getElementById('customBranchName') as HTMLInputElement;
                        const customBranchNameValue = customBranchName?.value?.trim?.();
                        if (customBranchNameValue && !Storage.getItem(Storage.getKey(inputValue, customBranchNameValue))) {
                            isAdded = true;
                        }
                    }
                }
            } else {
                isAdded = true;
            }
            if (isAdded) {
                //const isBranchEqual = document.getElementById('isBranchEqual') as HTMLInputElement;
                const storageValue: IStorageData = {
                    status: 'empty',
                    branchState: 'empty',
                }
                if (isBranchEqual?.checked) {
                    isBranchEqual.checked = false
                    storageValue.rep = 'engine';
                    Storage.add(inputValue, storageValue)
                    storageValue.rep = 'wasaby_controls';
                    Storage.add(inputValue, storageValue)
                } else {
                    if (isCustomBranch?.checked) {
                        isCustomBranch.checked = false;
                        const customBranchName = document.getElementById('customBranchName') as HTMLInputElement;
                        const customBranchNameValue = customBranchName?.value?.trim?.();
                        if (customBranchNameValue) {
                            storageValue.rep = customBranchNameValue;
                            Storage.addCustomBranches(customBranchNameValue);
                            customBranchName.value = '';
                        }
                        document.getElementById('dropdown').classList.add('hidden');
                    }
                    Storage.add(inputValue, storageValue)
                }
                input.value = '';
                input.focus();
            }
        }
    }
}

/**
 * Отображение списка веток за которыми следим
 */
function initPage() {
    Storage.formatData();
    Storage.setEmptyStatus();
    const branches = Storage.getFull();
    Object.keys(branches).forEach(branch => {
        if (branches[branch].branchName) {
            addItemInList(branches[branch].branchName, branches[branch].rep);
        } else {
            // Если в формате нет информации о ветке, значит с данными что-то не то
            Storage.remove(branch, false);
        }
    });
    init(true);
}

function visibleRemoveAll(isVisible: boolean) {
    const el = document.getElementById('removeAllButton') as HTMLElement;
    el.classList[isVisible ? 'remove' : 'add']('hidden');
}

Storage.subscribe('create', (name: string, data: IStorageData) => {
    processing(name, data);
    if (!document.getElementById(name) && data) {
        addItemInList(data.branchName, data.rep, data.progressValue);
    }
    visibleRemoveAll(true);
});
Storage.subscribe('update', (name: string, thisData: IStorageData, oldData: IStorageData) => {
    if (thisData && oldData &&
        thisData.branchState && oldData.branchState &&
        thisData.branchState !== oldData.branchState) {
        const el = document.getElementById(name) || document.getElementById(Storage.getKey(name, thisData.rep));
        if (el) {
            el.classList.remove(`branchItem_status-${oldData.branchState}`);
            el.classList.add(`branchItem_status-${thisData.branchState}`);
            el.style.setProperty('--progress-value', thisData.progressValue);
        }
    }
})
Storage.subscribe('remove', (name) => {
    removeBranch(name);
    if (!Object.keys(Storage.getFull()).length) {
        visibleRemoveAll(false);
    }
});

const DROPDOWN_ID = 'dropdownPopup';

function dropdownItemsClick(event: Event) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('dropdownRemove')) {
        const parent = target.parentElement;
        if (parent) {
            const name = parent.id;
            Storage.removeCustomBranches(name);
            parent.remove();
        }
    } else if (target.classList.contains('dropdownItems__item')) {
        const name = target.id;
        if (name) {
            const input = document.getElementById('customBranchName') as HTMLInputElement;
            if (input) {
                input.value = name;
                input.focus();
            }
        }
    }
}

function dropdownShow(filter: string = '') {
    const dropdown = document.getElementById(DROPDOWN_ID);
    const correctItems = Storage.getCustomBranches().filter(item => item.toLowerCase().includes(filter.toLowerCase()));
    const dropdownItems = document.getElementById('dropdownItems');
    if (dropdownItems) {
        dropdownItems.removeEventListener('mousedown', dropdownItemsClick);
    }
    if (dropdown) {
        dropdown.innerHTML = '';
        if (correctItems.length) {
            dropdown.classList.remove('hidden');
            const el = document.createElement('div');
            el.className = 'dropdownItems';
            el.id = 'dropdownItems';
            el.innerHTML = '';
            correctItems.forEach(item => {
                el.innerHTML += `<span class="dropdownItems__item" id="${item}">${item} <button class="dropdownRemove" tabindex="-1">x</button></span>`;
            });
            el.addEventListener('mousedown', dropdownItemsClick);
            dropdown.appendChild(el);
        } else {
            dropdown.classList.add('hidden');
        }
    }
}

function dropdownHide() {
    const dropdown = document.getElementById(DROPDOWN_ID);
    dropdown.classList.add('hidden');
}

window.onload = () => {
    document.getElementById('addBranchButton').addEventListener('click', addBranch);
    document.getElementById('branchName').addEventListener('keyup', (e) => {
        if (e.code === 'Enter') {
            addBranch();
        }
    });
    const customBranchName = document.getElementById('customBranchName') as HTMLInputElement;
    const isCustomBranch = document.getElementById('isCustomBranch') as HTMLInputElement;
    isCustomBranch.addEventListener('change', () => {
        customBranchName.value = Storage.getCustomBranches().at(-1) || '';
        document.getElementById('dropdown').classList[isCustomBranch.checked ? 'remove' : 'add']('hidden');
    });

    let timeoutId: NodeJS.Timeout;
    customBranchName.addEventListener('input', () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            dropdownShow(customBranchName.value);
            timeoutId = null;
        }, 10);
    });

    let isDropdownClick = false;

    document.body.addEventListener('mousedown', (event: Event) => {
        isDropdownClick = !!(event.target as HTMLElement).closest('.dropdown');
        if (!isDropdownClick) {
            dropdownHide();
        }
    });

    customBranchName.addEventListener('focus', () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        isDropdownClick = false;
        timeoutId = setTimeout(() => {
            dropdownShow();
            timeoutId = null;
        }, 10);
    });
    customBranchName.addEventListener('blur', () => {
        if (!(document.activeElement.closest('.dropdownItems') || isDropdownClick)) {
            dropdownHide();
            isDropdownClick = false;
        }
    });

    document.getElementById('removeAllButton').addEventListener('click', (e: Event) => {
        Storage.clear();
        (e.currentTarget as HTMLElement).classList.add('hidden');
    });

    initPage();
}

window.addEventListener("unload", () => {
    Storage.setEmptyStatus();
});