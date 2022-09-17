require('v8-compile-cache');

const {app, BrowserWindow} 	= require('electron');

if (require('electron-squirrel-startup')) return app.quit();

require('events').EventEmitter.prototype._maxListeners = 100;

const twig                 	= require('electron-twig')
const Router 			 	= require('electron-router')
const ed25519 				= require('ed25519');
const crypto 				= require('crypto');
const bip39 				= require('bip39');
const got 					= require('got');
const Datastore 			= require('nedb-promises');
const Big					= require('big.js');
const path					= require('path');
const portfinder 			= require('portfinder');
const { Octokit } 			= require('@octokit/rest')
const semver 				= require('semver')
const packageJson 			= require('./package.json');

const bambooAppVersion = 'v' + packageJson.version;

const octokit = new Octokit({
					userAgent: 'Bamboo Wallet ' + bambooAppVersion,
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

db.accounts.ensureIndex({ fieldName: 'account' }, function (err) {
  // If there was an error, err is not null
});

db.settings.ensureIndex({ fieldName: 'account' }, function (err) {
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

const i18n = new (require('i18n-2'))({
    // setup some locales - other locales default to the first locale
    locales: availableLocales,
    directory: `${app.getAppPath()}/locales`
});

const server = require('http').createServer(app);
const io = require('socket.io')(server);

var peers = ['http://65.21.224.171:3000', 'http://65.21.198.115:3000', 'http://65.108.122.77:3000'];
var randomPeer = randomIntFromInterval(0, (peers.length - 1));
var selectedPeer = peers[randomPeer];
var isConnected = false
var blockChainHeight = 0;
var lastDownloadedBlock = 0;
var isDownloadingBlocks = false;
var signalTransactionRefresh = false;
var mainSocket;
var loadedAccount = '';
var accountTransactions = [];
var accountBalance = Big(0).toFixed(4);
var serverPort;
var upgradeAvailable = false;
var latestGitVersion = '';

let mainWindow

function loadSettings() {

	checkVersion();

	db.settings.findOne({account: 'default'}).exec().then((defaultsettings) => {		

		if (defaultsettings && defaultsettings.locale) i18n.setLocale(defaultsettings.locale);

		portfinder.getPort(function (err, port) {

			if (err) app.quit()
	
			serverPort = port;
			server.listen(serverPort);

			console.log('Running on port: ' + serverPort);
					
			twig.view = {
				i18n: i18n,
				version: bambooAppVersion,
				localesObject: JSON.stringify(localesObject),
				peers: JSON.stringify(peers),
				selectedPeer: selectedPeer,
				serverPort: serverPort,
				latestVersion: latestGitVersion,
			};
			
			createWindow();

		});

	}).catch((e) => {
		console.log(e);
	});
	
}

function createWindow () {

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    },
    icon: "./icons/png/1024x1024.png"
  })
  
  mainWindow.loadURL(`file://${__dirname}/views/login.twig`);

  mainWindow.on('closed', function () {
    mainWindow = null
  })
  
  let router = Router('MAIN');
  
  router.on('ready', () => { })
  
  router.get('/login', ( req, res ) => {

	twig.view.currentRoute = 'login';
    mainWindow.loadURL(`file://${__dirname}/views/login.twig`);

  });

  router.get('/create', ( req, res ) => {

	twig.view.currentRoute = 'create';
    mainWindow.loadURL(`file://${__dirname}/views/create.twig`);
	
  });

  router.get('/restore', ( req, res ) => {

	twig.view.currentRoute = 'restore';
    mainWindow.loadURL(`file://${__dirname}/views/restore.twig`);
	
  });

  router.get('/restorepriv', ( req, res ) => {

	twig.view.currentRoute = 'restorepriv';
    mainWindow.loadURL(`file://${__dirname}/views/restorepriv.twig`);
	
  });
  
  /*
  router.get('/account', ( req, res ) => {

	twig.view.currentRoute = 'account';
    mainWindow.loadURL(`file://${__dirname}/views/main.twig`);
	
  });

  router.get('/send', ( req, res ) => {

	twig.view.currentRoute = 'send';
    mainWindow.loadURL(`file://${__dirname}/views/send.twig`);
	
  });

  router.get('/receive', ( req, res ) => {

	twig.view.currentRoute = 'receive';
    mainWindow.loadURL(`file://${__dirname}/views/receive.twig`);
	
  });

  router.get('/sign', ( req, res ) => {

	twig.view.currentRoute = 'sign';
    mainWindow.loadURL(`file://${__dirname}/views/sign.twig`);
	
  });
  
  router.get('/verify', ( req, res ) => {

	twig.view.currentRoute = 'verify';
    mainWindow.loadURL(`file://${__dirname}/views/verify.twig`);
	
  });
  
  router.get('/settings', ( req, res ) => {

	twig.view.currentRoute = 'settings';
    mainWindow.loadURL(`file://${__dirname}/views/settings.twig`);
	
  });
  */

  router.get('/main', ( req, res ) => {

	twig.view.currentRoute = 'main';
    mainWindow.loadURL(`file://${__dirname}/views/main.twig`);
	
  });
  
  router.get('/logout', ( req, res ) => {
  
	loadedAccount = '';
	accountTransactions = [];
	accountBalance = Big(0).toFixed(4);
	
	twig.view.currentRoute = 'login';
    mainWindow.loadURL(`file://${__dirname}/views/login.twig`);
	
  });
  
  setInterval(function() {
  
  	if (isDownloadingBlocks == false)
  	{
  		checkBlocksToDownload();
  	}
  	
  	checkPendingTransactions();
  	
  	mainSocket.emit('blockStats', {blockChainHeight: blockChainHeight, lastDownloadedBlock: lastDownloadedBlock, isConnected: isConnected, connectPeer: selectedPeer});
  	
  }, 10000);
  
  setInterval(function() {
	
	if (signalTransactionRefresh == true)
	{

		signalTransactionRefresh = false;
		
		(async () => {
		
			await getAccountTransactions();
		
			mainSocket.emit('accountUpdate');

		})();
		
	}
	
  },2000);

}

app.on('ready', loadSettings)

app.on('resize', function(e,x,y){
  mainWindow.setSize(x, y);
});

app.on('window-all-closed', function () {
  //if (process.platform !== 'darwin') {
    app.quit()
  //}
})

app.on('activate', function () {
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

io.on('connection', (socket) => { 

	mainSocket = socket;

	console.log('connected'); 

  	socket.emit('blockStats', {blockChainHeight: blockChainHeight, lastDownloadedBlock: lastDownloadedBlock, isConnected: isConnected, connectPeer: selectedPeer});

	socket.on('updateLocale', (locale, callback) => {

		(async () => {

			i18n.setLocale(locale);
		
			let havesettings = await db.settings.find({account: loadedAccount});
			
			if (havesettings.length == 0)
			{
			
				let newSettings = {
					account: loadedAccount,
					locale: locale
				}
				
				await db.settings.insert(newSettings);
			
			}
			else
			{
				
				await db.settings.update({account: loadedAccount}, {locale: locale});
			
			}

		
			let havedefaultsettings = await db.settings.findOne({account: 'default'}); // sets the default for login screen
			
			if (havedefaultsettings && havedefaultsettings.account)
			{
			
				let existingSetting = havedefaultsettings.accountSelect;
			
				let newSettings = {
					account: 'default',
					locale: locale,
					accountSelect: existingSetting
				}
				
				await db.settings.insert(newSettings);
			
			}
			else
			{
				
				await db.settings.update({account: 'default'}, {locale: locale, accountSelect: loadedAccount});
			
			}

			callback(true);
		
		})();

	});
	
	socket.on('updatePeer', (peer, callback) => {

		selectedPeer = peer;
		twig.view.selectedPeer = peer;
		
		callback(true);

	});

	socket.on('addCustomPeer', (peer, callback) => {

		peers.push(peer);
		selectedPeer = peer;
		twig.view.peers = JSON.stringify(peers);
		twig.view.selectedPeer = peer;
		
		callback(true);

	});
	
	socket.on('createAccount', (password, callback) => {
	
		(async () => {

			let mnemonic = bip39.generateMnemonic()

			let hash = crypto.createHash('sha256').update(mnemonic).digest(); //returns a buffer
		
			let keyPair = ed25519.MakeKeypair(hash);

			let address = walletAddressFromPublicKey(keyPair.publicKey.toString("hex").toUpperCase());

			let newAccount = {
				address: address,
				publicKey: keyPair.publicKey.toString("hex").toUpperCase(),
				privateKey: keyPair.privateKey.toString("hex").toUpperCase(),
				mnemonic: mnemonic
			};

			let encryptedData = encrypt(JSON.stringify(newAccount), password);
		
			let dbrecord = {
				account: address,
				encryptedData: encryptedData
			};
		
			loadedAccount = address;
		
			await db.accounts.insert(dbrecord);

			twig.view = {
				i18n: i18n,
				version: bambooAppVersion,
				loadedAccount: loadedAccount,
				accountBalance: accountBalance,
				localesObject: JSON.stringify(localesObject),
				peers: JSON.stringify(peers),
				selectedPeer: selectedPeer,
				serverPort: serverPort,
				latestVersion: latestGitVersion,
			}
				
			callback(newAccount);
		
		})();

	});

	socket.on('getAccountKeys', (password, callback) => {
	
		(async () => {

			let loadAccount = await db.accounts.findOne({account: loadedAccount});
			
			if (loadAccount && loadAccount.account)
			{
			
				try {
			
					let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));
					
					callback(decryptedAccount);
			
				} catch (e) {
			
					callback("ERR");
			
				}
			
			}
			else
			{
			
				callback("ERR");
			
			}

		})();

	});
	
	socket.on('restoreAccount', (options, callback) => {
	
		(async () => {

			let mnemonic = options.word1.trim() + ' ' + options.word2.trim() + ' ' + options.word3.trim() + ' ' + options.word4.trim() + ' ' + options.word5.trim() + ' ' + options.word6.trim() + ' ' + options.word7.trim() + ' ' + options.word8.trim() + ' ' + options.word9.trim() + ' ' + options.word10.trim() + ' ' + options.word11.trim() + ' ' + options.word12.trim();

			let isValid = bip39.validateMnemonic(mnemonic);

			if (isValid == false)
			{
			
				callback(false);
			
			}
			else
			{
			
				let password = options.password;
			
				let hash = crypto.createHash('sha256').update(mnemonic).digest(); //returns a buffer
		
				let keyPair = ed25519.MakeKeypair(hash);

				let address = walletAddressFromPublicKey(keyPair.publicKey.toString("hex").toUpperCase());

				let newAccount = {
					address: address,
					publicKey: keyPair.publicKey.toString("hex").toUpperCase(),
					privateKey: keyPair.privateKey.toString("hex").toUpperCase(),
					mnemonic: mnemonic
				};

				let encryptedData = encrypt(JSON.stringify(newAccount), password);
		
				let dbrecord = {
					account: address,
					encryptedData: encryptedData
				};
		
				loadedAccount = address;
						
				await db.accounts.remove({account: address});
				
				await db.accounts.insert(dbrecord);
				
				await getAccountTransactions();

				twig.view = {
					i18n: i18n,
					version: bambooAppVersion,
					loadedAccount: loadedAccount,
					accountBalance: accountBalance,
					localesObject: JSON.stringify(localesObject),
					peers: JSON.stringify(peers),
					selectedPeer: selectedPeer,
					serverPort: serverPort,
					latestVersion: latestGitVersion,
				}
				
				callback(newAccount);
			
			}
		
		})();

	});

	socket.on('restoreAccountPriv', (pubkey, privkey, password, callback) => {
	
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
					callback(false);
				}

				let address = walletAddressFromPublicKey(keyPair.publicKey.toString("hex").toUpperCase());

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
						
				await db.accounts.remove({account: address});
			
				await db.accounts.insert(dbrecord);
				
				await getAccountTransactions();

				twig.view = {
					i18n: i18n,
					version: bambooAppVersion,
					loadedAccount: loadedAccount,
					accountBalance: accountBalance,
					localesObject: JSON.stringify(localesObject),
					peers: JSON.stringify(peers),
					selectedPeer: selectedPeer,
					serverPort: serverPort,
					latestVersion: latestGitVersion,
				}
				
				callback(newAccount);
			
			} catch (e) {
		
				callback(false);
		
			}
		
		})();

	});
	
	socket.on('accountInfo', (callback) => {

		let accountInfo = {
			address: loadedAccount,
			balance: accountBalance
		};

		callback(accountInfo);

	});
	
	socket.on('transactionList', (callback) => {
	
		callback(accountTransactions);
	
	});

	socket.on('signMessage', (message, password, callback) => {
	
		(async () => {
		
			let loadAccount = await db.accounts.findOne({account: loadedAccount});

			if (loadAccount && loadAccount.account)
			{
		
				try {
		
					let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

					if (decryptedAccount.address == loadedAccount)
					{

						let privateKey = decryptedAccount.privateKey;
						let publicKey = decryptedAccount.publicKey;

						let keyPair = {
							publicKey: Buffer.from(publicKey, 'hex'),
							privateKey: Buffer.from(privateKey, 'hex')
						}

						let signature = ed25519.Sign(Buffer.from(message, 'utf8'), keyPair); //Using Sign(Buffer, Keypair object)

						let sig2 = signature.toString('hex').toUpperCase();

						callback({status: "OK", publicKey: publicKey, signature: sig2});

					}
					else
					{
				
						callback({status: "BADPASS"});
				
					}

				} catch (e) {
		
					callback({status: "BADPASS"});
		
				}
		
			}
			else
			{

				callback({status: "ERR"});
		
			}
		
		})();
		
	});

	socket.on('validateMessage', (message, signature, publicKey, callback) => {

		if (ed25519.Verify(Buffer.from(message, 'utf8'), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'))) {
		
			callback(true);
			
		} else {
		
			callback(false);
			
		}
		
	});
	
	socket.on('sendTransaction', (toaddress, amount, password, callback) => {
	
		(async () => {
		

			var pattern = /^[a-fA-F0-9]{50}$/;
					
			var isvalid = pattern.test(toaddress);
					
			if (Big(amount).lte(0.0001) || Big(amount).plus(0.0001).gt(accountBalance))
			{
			
				callback("BADAMOUNT");
			
			}
			else if (isvalid == false)
			{
			
				callback("BADADDRESS");
			
			}
			else
			{

				let loadAccount = await db.accounts.findOne({account: loadedAccount});

				if (loadAccount && loadAccount.account)
				{
			
					try {
			
						let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));

						if (decryptedAccount.address == loadedAccount)
						{
					
							let privateKey = decryptedAccount.privateKey;
							let publicKey = decryptedAccount.publicKey;
							let formatAmount = parseInt(Big(amount).times(10**4).toFixed(0));
							let nonce = Date.now();
							let fee = 1;

							let keyPair = {
								publicKey: Buffer.from(publicKey, 'hex'),
								privateKey: Buffer.from(privateKey, 'hex')
							}

							let trxTimestamp = Date.now();
						
							let tx = {
										"from": loadedAccount, 
										"to": toaddress, 
										"fee": fee,
										"amount": formatAmount, 
										"timestamp": trxTimestamp
									};

							let ctx = crypto.createHash('sha256');
						
							ctx.update(unhexlify(tx["to"]));
						
							ctx.update(unhexlify(tx["from"]));

							let hexfee = Buffer.from(parseInt(tx["fee"]).toString(16).padStart(16, '0'), 'hex');
							let hexfeea = Buffer.from(hexfee).toJSON().data;
							hexfeea.reverse();
							let swapfee = Buffer.from(hexfeea).toString('hex');
							ctx.update(unhexlify(swapfee));


							let hexamount = Buffer.from(parseInt(tx["amount"]).toString(16).padStart(16, '0'), 'hex');
							let hexamounta = Buffer.from(hexamount).toJSON().data;
							hexamounta.reverse();
							let swapamount = Buffer.from(hexamounta).toString('hex');
							ctx.update(unhexlify(swapamount));

							let hextimestamp = Buffer.from(parseInt(tx["timestamp"]).toString(16).padStart(16, '0'), 'hex');
							let hextimestampa = Buffer.from(hextimestamp).toJSON().data;
							hextimestampa.reverse();
							let swaptimestamp = Buffer.from(hextimestampa).toString('hex');
							ctx.update(unhexlify(swaptimestamp));
						
							let txc_hash = ctx.digest();

							let signature = ed25519.Sign(txc_hash, keyPair); //Using Sign(Buffer, Keypair object)

							let sig2 = signature.toString('hex').toUpperCase();

							let tx_json = {
										"amount": tx.amount, 
										"fee": tx.fee, 
										"from": tx.from,
										"signature": sig2,
										"signingKey": publicKey, 
										"timestamp": String(tx.timestamp),
										"to": tx.to
										};

							let postResponse = await got.post(selectedPeer + "/add_transaction_json", {json: [tx_json]}).json();

							if (postResponse[0] && postResponse[0].txid && postResponse[0].txid != '')
							{

								let txid = postResponse[0].txid;		

								tx_json.txid = txid;
								tx_json.pending = true;

								accountTransactions.unshift(tx_json);

								callback("OK");
						
							}
							else
							{

								callback("ERR");
					
							}
					
						}
						else
						{
					
							callback("BADPASS");
					
						}
			
					} catch (e) {
			
						callback("BADPASS");
			
					}
			
				}
				else
				{

					callback("ERR");
			
				}
			
			}

		
		})();
	
	});
	
	
	socket.on('login', (account, password, callback) => {

		(async () => {
		
			let loadAccount = await db.accounts.findOne({account: account});
			
			if (loadAccount && loadAccount.account)
			{
			
				try {
			
					let decryptedAccount = JSON.parse(decrypt(loadAccount.encryptedData, password));
					
					if (decryptedAccount.address == account)
					{
					
						loadedAccount = decryptedAccount.address;

						let havesettings = await db.settings.findOne({account: loadedAccount});
						
						if (havesettings && havesettings.locale) i18n.setLocale(havesettings.locale);


						let havedefaultsettings = await db.settings.findOne({account: 'default'}); // sets the default for login screen
			
						if (!havedefaultsettings)
						{
						
							let newSettings = {
								account: 'default',
								locale: i18n.getLocale(),
								accountSelect: loadedAccount
							}
				
							await db.settings.insert(newSettings);
			
						}
						else
						{
				
							await db.settings.update({account: 'default'}, {accountSelect: loadedAccount});
			
						}

						twig.view = {
							i18n: i18n,
							version: bambooAppVersion,
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
						
						await getAccountTransactions();

						callback("OK")
					
					}
					else
					{
					
						callback("ERR");
					
					}
			
				} catch (e) {
			
					callback("ERR");
			
				}
			
			}
			else
			{
			
				callback("ERR");
			
			}
			
		})();

	});
	
	socket.on('getAccountList', (callback) => {
	
		(async () => {
		
			let accounts = await db.accounts.find({});
		
			let accountList = [];
		
			for (let i = 0; i < accounts.length; i++)
			{
			
				let thisAccount = accounts[i];
			
				accountList.push(thisAccount.account);
		
			}
			
			let selected = '';
			let havedefaultsettings = await db.settings.findOne({account: 'default'});
						
			if (havedefaultsettings && havedefaultsettings.account)
			{
				selected = havedefaultsettings.accountSelect;
			}

			callback(accountList, selected);
		
		})();
	
	});
	
	socket.on('print', (callback) => {

		mainWindow.webContents.print({silent:true, printBackground:false})

		callback(true);
		
	});
	
	socket.on('forcerefresh', () => {
	
		(async () => {
	
			await getAccountTransactions();
	
			socket.emit('accountUpdate');
		
		})();
		
	});
	
});

// Functions

function checkMine(transaction) {

	return transaction.to == loadedAccount || transaction.from == loadedAccount;

}

function notYetShown(transaction) {

	let testArray = [];
	for (let i = 0; i < accountTransactions.length; i++) testArray.push(accountTransactions[i].txid);

	return testArray.indexOf(transaction.txid) == -1;

}

async function checkVersion() {

	const { data: tags } = await octokit.rest.repos.listTags({
	  owner: 'mrmikeo',
	  repo: 'bamboo-wallet'
	});

	var tagsSorted = tags.map(function (item) {
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

	if (pendingTransactions.length > 0)
	{
		signalTransactionRefresh = true;
	}

}

async function getAccountTransactions() {

	let chainBlocks = 0;
	
	try {
	
		chainBlocks = await got(selectedPeer + "/block_count").json();

		lastDownloadedBlock = chainBlocks;

	} catch (e) {

	}
	
	if (loadedAccount != '')
	{
	
		let getaccountTransactions = await got(selectedPeer + "/wallet_transactions?wallet=" + loadedAccount).json();
		
		getaccountTransactions.sort((a, b) => {
			return b.timestamp - a.timestamp;
		});
		
		accountTransactions = getaccountTransactions.filter(checkMine);

		let pendingTransactions = await got(selectedPeer + "/tx_json").json();
		pendingTransactions = pendingTransactions.filter(checkMine);

		for (let i = 0; i < pendingTransactions.length; i++)
		{
		
			let thisTx = pendingTransactions[i];
			thisTx.pending = true;
			
			accountTransactions.unshift(thisTx);
		
		}

		let accountInfo = await got(selectedPeer + "/ledger?wallet=" + loadedAccount).json();
		
		try {
		
			accountBalance = Big(accountInfo.balance).div(10**4).toFixed(4);
			
			twig.view.accountBalance = accountBalance;
			
		} catch (e) {
		
		}

	}

	return true;

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
	
	
	while (lastDownloadedBlock < chainBlocks && loadedAccount != '')
	{

		try {

			let nextBlock = await got(selectedPeer + "/block?blockId=" + (lastDownloadedBlock + 1)).json();

			if (nextBlock.id && nextBlock.id > 0)
			{
				
				let transactionList = nextBlock.transactions;

				for (let i = 0; i < transactionList.length; i++)
				{
				
					let thisTrx = transactionList[i];
					
					if (thisTrx.from == loadedAccount || thisTrx.to == loadedAccount)
					{

						setTimeout(function() {
							signalTransactionRefresh = true;
						},5000);
					
					}
				
				}
			
				lastDownloadedBlock = nextBlock.id;
			
			}
			else
			{
			
				break;
				
			}
		
		} catch (e) {

			break;
		
		}

	}
	
	isDownloadingBlocks = false;

}

function walletAddressFromPublicKey(publicKey) 
{
	
	let bpublicKey = Buffer.from(publicKey, "hex");
	
	let hash = crypto.createHash('sha256').update(bpublicKey).digest();

	let hash2 = crypto.createHash('ripemd160').update(hash).digest();

	let hash3 = crypto.createHash('sha256').update(hash2).digest();

	let hash4 = crypto.createHash('sha256').update(hash3).digest();
	
	let checksum = hash4[0];
	
	let address = [];
	
    address[0] = '00';
    for(let i = 1; i <= 20; i++) 
    {
        address[i] = pad(hash2[i-1].toString(16), 2);
    }
    address[21] = pad(hash4[0].toString(16), 2);
    address[22] = pad(hash4[1].toString(16), 2);
    address[23] = pad(hash4[2].toString(16), 2);
    address[24] = pad(hash4[3].toString(16), 2);
    
    return address.join('').toUpperCase();

}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
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
