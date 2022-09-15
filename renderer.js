//Make Node.js API calls in this file
const $ = require('jquery')
const Router = require('electron-router')
window.router = Router('WINDOW')

// On window ready
$(() => {
  // Send ready event to all registered handlers
  router.send('ready')

  socket.on('blockStats', function(blockStats) {

	$('#lastDownloadedBlock').html(blockStats.lastDownloadedBlock);
	$('#blockChainHeight').html(blockStats.blockChainHeight);
	
	if (blockStats.isConnected == true)
	{

		$('#connectionStatus').html(`<svg style="margin-top:-3px;" width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
								<rect y="9.667" width="1.67" height="2.5" fill="#00C186"></rect>
								<rect x="4.44446" y="5.667" width="1.66667" height="6.67" fill="#00C186"></rect>
								<rect x="8.88892" y="3" width="1.66667" height="10.83" fill="#00C186"></rect>
								<rect x="13.3333" width="1.66667" height="15" fill="#00C186"></rect>
							</svg>`);
							
	}
	else
	{

		$('#connectionStatus').html(`<svg style="margin-top:-3px;" width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
								<rect y="9.667" width="1.67" height="2.5" fill="#CCC"></rect>
								<rect x="4.44446" y="5.667" width="1.66667" height="6.67" fill="#CCC"></rect>
								<rect x="8.88892" y="3" width="1.66667" height="10.83" fill="#CCC"></rect>
								<rect x="13.3333" width="1.66667" height="15" fill="#CCC"></rect>
							</svg>`);
	
	}
  
  });
  
})