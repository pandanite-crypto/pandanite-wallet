//Make Node.js API calls in this file
const {
    ipcRenderer
} = require("electron");

window.$ = window.jQuery = require('jquery')
const Router = require('electron-router')
window.router = Router('WINDOW')

window.QRCode = require('qrcode');
window.Big = require('big.js');
	
// On window ready
$(() => {

  	router.send('ready')

	ipcRenderer.on("fromMain", function(event, method, data) {

		$(window).trigger(method, [data]);

	});

})

window.emitMessage = async function(method,data,cb) {

	ipcRenderer.invoke("toMain:" + method, data).then( (value) => {
		cb(value);
	});
        
}
