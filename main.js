require('v8-compile-cache');

const {
    app,
    BrowserWindow,
    ipcMain
} = require('electron');

if (require('electron-squirrel-startup')) return app.quit();

const twig = require('electron-twig')
const Router = require('electron-router')
const ed25519 = require('ed25519');
const crypto = require('crypto');
const bip39 = require('bip39');
const got = require('got');
const Datastore = require('nedb-promises');
const Big = require('big.js');
const path = require('path');
const portfinder = require('portfinder');
const {
    Octokit
} = require('@octokit/rest')
const semver = require('semver')
const packageJson = require('./package.json');
const Pandanite = require('pandanite-js');

const EventEmitter = require('events');
EventEmitter.prototype._maxListeners = 100;

const socketEvent = new EventEmitter();

const pandaniteCrypto = new Pandanite.crypto();

const pandaniteAppVersion = 'v' + packageJson.version;

const octokit = new Octokit({
    userAgent: 'Pandanite Wallet ' + pandaniteAppVersion,
    baseUrl: 'https://api.github.com',
    request: {
        agent: undefined,
        fetch: undefined,
        timeout: 0
    }
});

const userDataPath = app.getPath('userData');
const accountsdb = path.join(userDataPath, 'accounts.db');
const settingsdb = path.join(userDataPath, 'settings.db');

var db = {};
db.accounts = Datastore.create(accountsdb);
db.settings = Datastore.create(settingsdb);

db.accounts.ensureIndex({
    fieldName: 'account'
}, function(err) {
    // If there was an error, err is not null
});

db.settings.ensureIndex({
    fieldName: 'account'
}, function(err) {
    // If there was an error, err is not null
});

const localesObject = {
    'en': 'English',
    'id': 'Bahasa Indonesia',
    'es': 'Español (Internacional)',
    'fr': 'Français',
    'tl': 'Filipino',
    'af': 'Français (Afrique)',
    'el': 'Ελληνικά',
    'de': 'Deutsch',
    'hu': 'Magyar Nyelv',
    'hu': 'हिन्दी, हिंदी',
    'it': 'Italiano',
    'nl': 'Nederlands',
    'pl': 'Polski',
    'pt-BR': 'Português (Brasil)',
    'pt-PT': 'Português (Portugal)',
    'ro': 'Română',
    'sv': 'Svenska',
    'sk': 'Slovenčina',
    'sl': 'Slovenščina',
    'vi': 'Tiếng Việt',
    'be': 'беларуская мова',
    'th': 'ภาษาไทย',
    'tr': 'Türkçe',
    'lv': 'latviešu valoda',
    'ru': 'Русский',
    'uk': 'Українська',
    'bg': 'български',
    'ar': 'العربية',
    'bn': 'বাংলা',
    'ja': '日本語',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'ko': '한국어'
};

const availableLocales = Object.keys(localesObject);

const i18n = new(require('i18n-2'))({
    // setup some locales - other locales default to the first locale
    locales: availableLocales,
    directory: `${app.getAppPath()}/locales`,
    extension: '.json'
});

var peers = ['https://pandanite.net'];
var randomPeer = randomIntFromInterval(0, (peers.length - 1));
var selectedPeer = peers[randomPeer];
var isConnected = false
var blockChainHeight = 0;
var lastDownloadedBlock = 0;
var isDownloadingBlocks = false;
var signalTransactionRefresh = false;
var loadedAccount = '';
var accountTransactions = [];
var accountBalance = Big(0).toFixed(4);
var serverPort;
var upgradeAvailable = false;
var latestGitVersion = '';

let mainWindow

function loadSettings() {

    checkVersion();

    db.settings.findOne({
        account: 'default'
    }).exec().then((defaultsettings) => {

        if (defaultsettings && defaultsettings.locale) i18n.setLocale(defaultsettings.locale);

        twig.view = {
            i18n: i18n,
            version: pandaniteAppVersion,
            localesObject: JSON.stringify(localesObject),
            peers: JSON.stringify(peers),
            selectedPeer: selectedPeer,
            serverPort: serverPort,
            latestVersion: latestGitVersion,
        };

        createWindow();

    }).catch((e) => {
        console.log(e);
    });

}

function createWindow() {

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 600,
        webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			enableRemoteModule: true,
        },
        icon: "./icons/png/1024x1024.png",
        titleBarStyle: 'hidden',
    })

    mainWindow.loadURL(`file://${__dirname}/views/login.twig`);

    mainWindow.on('closed', function() {
        mainWindow = null
    })

    let router = Router('MAIN');

    router.on('ready', () => {})

    router.get('/login', (req, res) => {

        twig.view.currentRoute = 'login';
        mainWindow.loadURL(`file://${__dirname}/views/login.twig`);

    });

    router.get('/create', (req, res) => {

        twig.view.currentRoute = 'create';
        mainWindow.loadURL(`file://${__dirname}/views/create.twig`);

    });

    router.get('/restore', (req, res) => {

        twig.view.currentRoute = 'restore';
        mainWindow.loadURL(`file://${__dirname}/views/restore.twig`);

    });

    router.get('/restore24', (req, res) => {

        twig.view.currentRoute = 'restore24';
        mainWindow.loadURL(`file://${__dirname}/views/restore24.twig`);

    });

    router.get('/restorepriv', (req, res) => {

        twig.view.currentRoute = 'restorepriv';
        mainWindow.loadURL(`file://${__dirname}/views/restorepriv.twig`);

    });

    router.get('/main', (req, res) => {

        twig.view.currentRoute = 'main';
        mainWindow.loadURL(`file://${__dirname}/views/main.twig`);

    });

    router.get('/logout', (req, res) => {

        loadedAccount = '';
        accountTransactions = [];
        accountBalance = Big(0).toFixed(4);

        twig.view.currentRoute = 'login';
        mainWindow.loadURL(`file://${__dirname}/views/login.twig`);

    });

    setInterval(function() {

        if (isDownloadingBlocks == false) {
            checkBlocksToDownload();
        }

        checkPendingTransactions();

        try {
            mainWindow.webContents.send("fromMain", 'blockStats', {
                blockChainHeight: blockChainHeight,
                isConnected: isConnected,
                connectPeer: selectedPeer
            });
        } catch (e) {

        }

    }, 10000);

    setInterval(function() {

        if (signalTransactionRefresh == true) {

            signalTransactionRefresh = false;

            (async () => {

                await getAccountTransactions();

                mainWindow.webContents.send("fromMain", 'accountUpdate', '')

            })();

        }

    }, 2000);

    doInitialLoad();

}

app.on('ready', loadSettings)

app.on('resize', function(e, x, y) {
    mainWindow.setSize(x, y);
});

app.on('window-all-closed', function() {
    //if (process.platform !== 'darwin') {
    app.quit()
    //}
})

app.on('activate', function() {
    if (mainWindow === null) {
        createWindow()
    }
})

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function unhexlify(str) {
    var result = [];
    while (str.length >= 2) {
        result.push(parseInt(str.substring(0, 2), 16));
        str = str.substring(2, str.length);
    }
    return new Uint8Array(result);
}

function doInitialLoad() {

    console.log('connected');

    mainWindow.webContents.send("fromMain", 'blockStats', {
        blockChainHeight: blockChainHeight,
        lastDownloadedBlock: lastDownloadedBlock,
        isConnected: isConnected,
        connectPeer: selectedPeer
    });

    ipcMain.handle("toMain:updateLocale", async (event, locale) => {

        return new Promise((resolve, reject) => {

            (async () => {

                i18n.setLocale(locale);

                let havesettings = await db.settings.find({
                    account: loadedAccount
                });

                if (havesettings.length == 0) {

                    let newSettings = {
                        account: loadedAccount,
                        locale: locale
                    }

                    await db.settings.insert(newSettings);

                } else {

                    await db.settings.update({
                        account: loadedAccount
                    }, {
                        locale: locale
                    });

                }


                let havedefaultsettings = await db.settings.findOne({
                    account: 'default'
                }); // sets the default for login screen

                if (havedefaultsettings && havedefaultsettings.account) {

                    let existingSetting = havedefaultsettings.accountSelect;

                    let newSettings = {
                        account: 'default',
                        locale: locale,
                        accountSelect: existingSetting
                    }

                    await db.settings.insert(newSettings);

                } else {

                    await db.settings.update({
                        account: 'default'
                    }, {
                        locale: locale,
                        accountSelect: loadedAccount
                    });

                }

                resolve(true);

            })();

        });

    });

    ipcMain.handle("toMain:updatePeer", async (event, peer) => {

        return new Promise((resolve, reject) => {

            selectedPeer = peer;
            twig.view.selectedPeer = peer;

            resolve(true);

        });

    });

    ipcMain.handle("toMain:addCustomPeer", async (event, peer) => {

        return new Promise((resolve, reject) => {

            peers.push(peer);
            selectedPeer = peer;
            twig.view.peers = JSON.stringify(peers);
            twig.view.selectedPeer = peer;

            resolve(true);

        });

    });

    ipcMain.handle("toMain:createAccount", async (event, data) => {

        let password = data.password;
        let seedpassword = data.seedpassword;

        return new Promise((resolve, reject) => {

            (async () => {

                let newAccount = pandaniteCrypto.generateNewAddress(seedpassword);

                let encryptedData = encrypt(JSON.stringify(newAccount), password);

                let dbrecord = {
                    account: newAccount.address,
                    encryptedData: encryptedData
                };

                loadedAccount = newAccount.address;

                await db.accounts.insert(dbrecord);

                twig.view = {
                    i18n: i18n,
                    version: pandaniteAppVersion,
                    loadedAccount: loadedAccount,
                    accountBalance: accountBalance,
                    localesObject: JSON.stringify(localesObject),
                    peers: JSON.stringify(peers),
                    selectedPeer: selectedPeer,
                    serverPort: serverPort,
                    latestVersion: latestGitVersion,
                }

                resolve(newAccount);

            })();

        });
    });

    ipcMain.handle("toMain:getAccountKeys", async (event, password) => {

        return new Promise((resolve, reject) => {

            (async () => {

                let loadAccount = await db.accounts.findOne({
                    account: loadedAccount
                });

                if (loadAccount && loadAccount.account) {

                    try {

                        let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

                        resolve(decryptedAccount);

                    } catch (e) {

                        resolve("ERR");

                    }

                } else {

                    resolve("ERR");

                }

            })();

        });

    });

    ipcMain.handle("toMain:restoreAccount", async (event, options) => {

        return new Promise((resolve, reject) => {

            (async () => {

                let mnemonic = options.word1.trim() + ' ' + options.word2.trim() + ' ' + options.word3.trim() + ' ' + options.word4.trim() + ' ' + options.word5.trim() + ' ' + options.word6.trim() + ' ' + options.word7.trim() + ' ' + options.word8.trim() + ' ' + options.word9.trim() + ' ' + options.word10.trim() + ' ' + options.word11.trim() + ' ' + options.word12.trim();

                let isValid = bip39.validateMnemonic(mnemonic);

                if (isValid == false) {

                    resolve(false);

                } else {

                    let password = options.password;

                    let seedpassword = options.seedpassword;

                    let newAccount = pandaniteCrypto.generateAddressFromMnemonic(mnemonic, seedpassword);

                    let encryptedData = encrypt(JSON.stringify(newAccount), password);

                    let dbrecord = {
                        account: newAccount.address,
                        encryptedData: encryptedData
                    };

                    loadedAccount = newAccount.address;

                    await db.accounts.remove({
                        account: newAccount.address
                    });

                    await db.accounts.insert(dbrecord);

                    await getAccountTransactions();

                    twig.view = {
                        i18n: i18n,
                        version: pandaniteAppVersion,
                        loadedAccount: loadedAccount,
                        accountBalance: accountBalance,
                        localesObject: JSON.stringify(localesObject),
                        peers: JSON.stringify(peers),
                        selectedPeer: selectedPeer,
                        serverPort: serverPort,
                        latestVersion: latestGitVersion,
                    }

                    resolve(newAccount);

                }

            })();

        });

    });

    ipcMain.handle("toMain:restoreAccount24", async (event, options) => {

        return new Promise((resolve, reject) => {

            (async () => {

                let mnemonic = options.word1.trim() + ' ' + options.word2.trim() + ' ' + options.word3.trim() + ' ' + options.word4.trim() + ' ' + options.word5.trim() + ' ' + options.word6.trim() + ' ' + options.word7.trim() + ' ' + options.word8.trim() + ' ' + options.word9.trim() + ' ' + options.word10.trim() + ' ' + options.word11.trim() + ' ' + options.word12.trim() + ' ' + options.word13.trim() + ' ' + options.word14.trim() + ' ' + options.word15.trim() + ' ' + options.word16.trim() + ' ' + options.word17.trim() + ' ' + options.word18.trim() + ' ' + options.word19.trim() + ' ' + options.word20.trim() + ' ' + options.word21.trim() + ' ' + options.word22.trim() + ' ' + options.word23.trim() + ' ' + options.word24.trim();

                let isValid = bip39.validateMnemonic(mnemonic);

                if (isValid == false) {

                    resolve(false);

                } else {

                    let password = options.password;

                    let seedpassword = options.seedpassword;

                    let newAccount = pandaniteCrypto.generateAddressFromMnemonic(mnemonic, seedpassword);

                    let encryptedData = encrypt(JSON.stringify(newAccount), password);

                    let dbrecord = {
                        account: newAccount.address,
                        encryptedData: encryptedData
                    };

                    loadedAccount = newAccount.address;

                    await db.accounts.remove({
                        account: newAccount.address
                    });

                    await db.accounts.insert(dbrecord);

                    await getAccountTransactions();

                    twig.view = {
                        i18n: i18n,
                        version: pandaniteAppVersion,
                        loadedAccount: loadedAccount,
                        accountBalance: accountBalance,
                        localesObject: JSON.stringify(localesObject),
                        peers: JSON.stringify(peers),
                        selectedPeer: selectedPeer,
                        serverPort: serverPort,
                        latestVersion: latestGitVersion,
                    }

                    resolve(newAccount);

                }

            })();

        });

    });

    ipcMain.handle("toMain:restoreAccountPriv", async (event, data) => {

        let pubkey = data.publicKey;
        let privkey = data.privateKey;
        let password = data.password;

        return new Promise((resolve, reject) => {

            (async () => {

                try {

                    let keyPair = {
                        publicKey: Buffer.from(pubkey, 'hex'),
                        privateKey: Buffer.from(privkey, 'hex')
                    }

                    // Test KeyPair

                    var message = 'Is this a valid keypair?';

                    var signature = ed25519.Sign(Buffer.from(message, 'utf8'), keyPair);

                    if (ed25519.Verify(Buffer.from(message, 'utf8'), signature, keyPair.publicKey)) {
                        console.log('Signature valid');
                    } else {
                        resolve(false);
                    }

                    let address = pandaniteCrypto.walletAddressFromPublicKey(keyPair.publicKey.toString("hex").toUpperCase());

                    let newAccount = {
                        address: address,
                        publicKey: keyPair.publicKey.toString("hex").toUpperCase(),
                        privateKey: keyPair.privateKey.toString("hex").toUpperCase(),
                        mnemonic: ''
                    };

                    let encryptedData = encrypt(JSON.stringify(newAccount), password);

                    let dbrecord = {
                        account: address,
                        encryptedData: encryptedData
                    };

                    loadedAccount = address;

                    await db.accounts.remove({
                        account: address
                    });

                    await db.accounts.insert(dbrecord);

                    await getAccountTransactions();

                    twig.view = {
                        i18n: i18n,
                        version: pandaniteAppVersion,
                        loadedAccount: loadedAccount,
                        accountBalance: accountBalance,
                        localesObject: JSON.stringify(localesObject),
                        peers: JSON.stringify(peers),
                        selectedPeer: selectedPeer,
                        serverPort: serverPort,
                        latestVersion: latestGitVersion,
                    }

                    resolve(newAccount);

                } catch (e) {

                    resolve(false);

                }

            })();

        });

    });

    ipcMain.handle("toMain:accountInfo", async (event, data) => {

        return new Promise((resolve, reject) => {

            let accountInfo = {
                address: loadedAccount,
                balance: accountBalance
            };

            resolve(accountInfo);

        });

    });

    ipcMain.handle("toMain:transactionList", async (event, data) => {

        return new Promise((resolve, reject) => {

            resolve(accountTransactions);

        });

    });

    ipcMain.handle("toMain:signMessage", async (event, data) => {

        let message = data.message;
        let password = data.password;

        return new Promise((resolve, reject) => {

            (async () => {

                let loadAccount = await db.accounts.findOne({
                    account: loadedAccount
                });

                if (loadAccount && loadAccount.account) {

                    try {

                        let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

                        if (decryptedAccount.address == loadedAccount) {

                            let privateKey = decryptedAccount.privateKey;
                            let publicKey = decryptedAccount.publicKey;

                            let signature = pandaniteCrypto.signMessage(message, publicKey, privateKey);

                            resolve({
                                status: "OK",
                                publicKey: publicKey,
                                signature: signature
                            });

                        } else {

                            resolve({
                                status: "BADPASS"
                            });

                        }

                    } catch (e) {

                        resolve({
                            status: "BADPASS"
                        });

                    }

                } else {

                    resolve({
                        status: "ERR"
                    });

                }

            })();

        });

    });

    ipcMain.handle("toMain:validateMessage", async (event, data) => {

        let message = data.message;
        let signature = data.signature;
        let publicKey = data.publicKey;

        return new Promise((resolve, reject) => {

            let validated = pandaniteCrypto.verifyMessage(message, publicKey, signature);

            resolve(validated);

        });

    });

    ipcMain.handle("toMain:sendTransaction", async (event, data) => {

        let toAddress = data.toaccount;
        let amount = data.amount
        let password = data.password;

        return new Promise((resolve, reject) => {

            (async () => {

                var isvalid = pandaniteCrypto.validateAddress(toAddress);

                if (Big(amount).lte(0.0001) || Big(amount).plus(0.0001).gt(accountBalance)) {

                    resolve("BADAMOUNT");

                } else if (isvalid == false) {

                    resolve("BADADDRESS");

                } else {

                    let loadAccount = await db.accounts.findOne({
                        account: loadedAccount
                    });

                    if (loadAccount && loadAccount.account) {

                        try {

                            let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

                            if (decryptedAccount.address == loadedAccount) {

                                let privateKey = decryptedAccount.privateKey;
                                let publicKey = decryptedAccount.publicKey;

                                let tx_json = pandaniteCrypto.createSignedTransaction(toAddress, amount, publicKey, privateKey);

                                let postResponse = await got.post(selectedPeer + "/add_transaction_json", {
                                    json: [tx_json]
                                }).json();

                                if (postResponse[0] && postResponse[0].txid && postResponse[0].txid != '') {

                                    let txid = postResponse[0].txid;

                                    tx_json.txid = txid;
                                    tx_json.pending = true;

                                    accountTransactions.unshift(tx_json);

                                    resolve("OK");

                                } else {

                                    resolve("ERR");

                                }

                            } else {

                                resolve("BADPASS");

                            }

                        } catch (e) {

                            resolve("BADPASS");

                        }

                    } else {

                        resolve("ERR");

                    }

                }


            })();

        });

    });

    ipcMain.handle("toMain:login", async (event, data) => {

        let account = data.account;
        let password = data.password;
        let node = data.node;
        
        if (node && node != '' && node != 'default')
        {
        	selectedPeer = node;
        }

        return new Promise((resolve, reject) => {

            (async () => {

                let loadAccount = await db.accounts.findOne({
                    account: account
                });

                if (loadAccount && loadAccount.account) {

                    try {

                        let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

                        if (decryptedAccount.address == account) {

                            loadedAccount = decryptedAccount.address;

                            let havesettings = await db.settings.findOne({
                                account: loadedAccount
                            });

                            if (havesettings && havesettings.locale) i18n.setLocale(havesettings.locale);


                            let havedefaultsettings = await db.settings.findOne({
                                account: 'default'
                            }); // sets the default for login screen

                            if (!havedefaultsettings) {

                                let newSettings = {
                                    account: 'default',
                                    locale: i18n.getLocale(),
                                    accountSelect: loadedAccount
                                }

                                await db.settings.insert(newSettings);

                            } else {

                                await db.settings.update({
                                    account: 'default'
                                }, {
                                    accountSelect: loadedAccount
                                });

                            }

                            twig.view = {
                                i18n: i18n,
                                version: pandaniteAppVersion,
                                loadedAccount: loadedAccount,
                                accountBalance: accountBalance,
                                localesObject: JSON.stringify(localesObject),
                                peers: JSON.stringify(peers),
                                selectedPeer: selectedPeer,
                                serverPort: serverPort,
                                upgradeAvailable: upgradeAvailable,
                                latestVersion: latestGitVersion,
                            }

                            accountTransactions = [];

                            try {
                                await getAccountTransactions();
                            } catch (e) {

                            }

                            resolve("OK");

                        } else {

                            resolve("ERR");

                        }

                    } catch (e) {

                        resolve("ERR");

                    }

                } else {

                    resolve("ERR");

                }

            })();

        });

    });

    ipcMain.handle("toMain:getAccountList", async (event, data) => {

        return new Promise((resolve, reject) => {

            (async () => {

                let accounts = await db.accounts.find({});

                let accountList = [];

                for (let i = 0; i < accounts.length; i++) {

                    let thisAccount = accounts[i];

                    accountList.push(thisAccount.account);

                }

                let selected = '';
                let havedefaultsettings = await db.settings.findOne({
                    account: 'default'
                });

                if (havedefaultsettings && havedefaultsettings.account) {
                    selected = havedefaultsettings.accountSelect;
                }

                resolve({
                    accountList: accountList,
                    selected: selected
                });

            })();

        });

    });

    ipcMain.handle("toMain:print", async (event, data) => {

        return new Promise((resolve, reject) => {

            mainWindow.webContents.print({
                silent: true,
                printBackground: false
            })

            resolve(true);

        });

    });

    ipcMain.handle("toMain:forcerefresh", async (event, data) => {

        return new Promise((resolve, reject) => {

            doForceRefresh();

            resolve(true);
        });

    });

}

// Functions

function doForceRefresh() {

    (async () => {

        await getAccountTransactions();

        mainWindow.webContents.send("fromMain", 'accountUpdate', '')

    })();

}

function checkMine(transaction) {

    return transaction.to == loadedAccount || transaction.from == loadedAccount;

}

function notYetShown(transaction) {

    let testArray = [];
    for (let i = 0; i < accountTransactions.length; i++) testArray.push(accountTransactions[i].txid);

    return testArray.indexOf(transaction.txid) == -1;

}

async function checkVersion() {

    const {
        data: tags
    } = await octokit.rest.repos.listTags({
        owner: 'pandanite-crypto',
        repo: 'pandanite-wallet'
    });

    var tagsSorted = tags.map(function(item) {
            return item.name
        })
        .filter(semver.valid)
        .sort(semver.rcompare)

    let latestVersion = tagsSorted[0];

    console.log("Lastest Version: " + latestVersion);

    latestGitVersion = latestVersion;

}

async function checkPendingTransactions() {

    let pendingTransactions = await got(selectedPeer + "/tx_json").json();
    pendingTransactions = pendingTransactions.filter(checkMine);
    pendingTransactions = pendingTransactions.filter(notYetShown);

    if (pendingTransactions.length > 0) {
        signalTransactionRefresh = true;
    }

}

function getAccountTransactions() {

    return new Promise((resolve, reject) => {

        (async () => {

            let chainBlocks = 0;

            try {

                chainBlocks = await got(selectedPeer + "/block_count").json();

                lastDownloadedBlock = chainBlocks;

            } catch (e) {

            }

            if (loadedAccount != '') {

                let accountInfo = await got(selectedPeer + "/ledger?wallet=" + loadedAccount).json();

                try {

                    accountBalance = Big(accountInfo.balance).div(10 ** 4).toFixed(4);

                    twig.view.accountBalance = accountBalance;

                } catch (e) {

                }

                let getaccountTransactions = await got(selectedPeer + "/wallet_transactions?wallet=" + loadedAccount).json();

                for (let i = 0; i < getaccountTransactions.length; i++) {

                    if (getaccountTransactions[i].timestamp < 3000000000) getaccountTransactions[i].timestamp = getaccountTransactions[i].timestamp * 1000;

                }

                getaccountTransactions.sort((a, b) => {
                    return b.timestamp - a.timestamp;
                });

                accountTransactions = getaccountTransactions.filter(checkMine);

                let pendingTransactions = await got(selectedPeer + "/tx_json").json();
                pendingTransactions = pendingTransactions.filter(checkMine);

                for (let i = 0; i < pendingTransactions.length; i++) {

                    let thisTx = pendingTransactions[i];
                    thisTx.pending = true;

                    accountTransactions.unshift(thisTx);

                }

            }

            resolve(true);

        })();

    });

}

async function checkBlocksToDownload() {

    isDownloadingBlocks = true;

    let chainBlocks = 0;

    try {

        chainBlocks = await got(selectedPeer + "/block_count").json();

        isConnected = true;

        blockChainHeight = chainBlocks;

        if (lastDownloadedBlock == 0) lastDownloadedBlock = chainBlocks;

    } catch (e) {

        isConnected = false;

    }


    while (lastDownloadedBlock < chainBlocks && loadedAccount != '') {

        try {

            let nextBlock = await got(selectedPeer + "/block?blockId=" + (lastDownloadedBlock + 1)).json();

            if (nextBlock.id && nextBlock.id > 0) {

                let transactionList = nextBlock.transactions;

                for (let i = 0; i < transactionList.length; i++) {

                    let thisTrx = transactionList[i];

                    if (thisTrx.from == loadedAccount || thisTrx.to == loadedAccount) {

                        setTimeout(function() {
                            signalTransactionRefresh = true;
                        }, 5000);

                    }

                }

                lastDownloadedBlock = nextBlock.id;

            } else {

                break;

            }

        } catch (e) {

            break;

        }

    }

    isDownloadingBlocks = false;

}

const encrypt = (text, password) => {

    let pwhash = crypto.createHash('md5').update(password).digest("hex");

    let iv = crypto.randomBytes(16);

    let algorithm = 'aes-256-ctr';

    const cipher = crypto.createCipheriv(algorithm, pwhash, iv);

    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

const decrypt = (hash, password) => {

    let pwhash = crypto.createHash('md5').update(password).digest("hex");

    let algorithm = 'aes-256-ctr';

    const decipher = crypto.createDecipheriv(algorithm, pwhash, Buffer.from(hash.iv, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);

    return decrypted.toString();

};
