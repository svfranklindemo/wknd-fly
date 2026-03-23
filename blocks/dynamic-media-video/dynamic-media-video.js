let dmViewerPromise;

/**
 * Decorate the dm-video block.
 * @param {Element} block The block root element.
 */
export default async function decorate(block) {
 
  if (!window.dmviewers || !window.dmviewers.VideoViewer) {
    console.error('DM VideoViewer not available on window.dmviewers');
    return;
  }

  const videolinks = block.querySelectorAll('a[href]');
  //https://delivery-p153659-e1620914.adobeaemcloud.com/adobe/assets/urn:aaid:aem:20bd71c3-a5a1-4b9e-833e-42e5cd028c3c/renditions/original/as/SampleVideo1mb.mp4?assetname=SampleVideo1mb.mp4

  if(videolinks.length != 0){
    let videoUrl = videolinks[0].href;

    const urnPattern = /(\/adobe\/assets\/urn:[^\/]+)/i;
    const match = videoUrl.match(urnPattern);

    if (!match) {
      console.error('Invalid Dynamic Media video URL format');
      return null;
    }

    // Extract the base URL (protocol + hostname)
    const videoURLObj = new URL(videoUrl);
    const baseUrl = `${videoURLObj.protocol}//${videoURLObj.hostname}`;

    // Extract the asset ID path (e.g., /adobe/assets/urn:aaid:aem:20bd71c3-a5a1-4b9e-833e-42e5cd028c3c)
    const assetIdPath = match[1];

    // Construct the URLs
    const posterImageUrl = `${baseUrl}${assetIdPath}/as/thumbnail.jpeg?preferwebp=true`;
    const dashUrl = `${baseUrl}${assetIdPath}/manifest.mpd`;
    const hlsUrl = `${baseUrl}${assetIdPath}/manifest.m3u8`;

    // Create a container for the DM viewer
   // const playerContainer = block.querySelector('.dynamic-media-video');


    
    block.id = `dm-video-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const params = {
      posterimage: posterImageUrl,
      sources: {},
    };

    if (dashUrl) params.sources.DASH = dashUrl;
    if (hlsUrl) params.sources.HLS = hlsUrl;

    let autoplay = '';
	  let loop = '';
	  let muted = '';
	  let showControls = '';

    const siblings = [];
    let current = block.nextElementSibling;

    // Collect up to 4 siblings (preset, rotate, flip, crop) in order
    while (current && siblings.length < 7) {
      siblings.push(current);
      current = current.nextElementSibling;
    }

    // Helper to safely consume a sibling element's trimmed text and remove it
    const consumeSiblingText = (el) => {
      if (!el) return '';
      const text = el.textContent?.trim() || '';
      if (text) el.remove();
      return text;
    };

    // Order matters: preset, rotate, flip, crop
    if (siblings.length > 0) {
      autoplay = consumeSiblingText(siblings.shift()) || false;
      loop = consumeSiblingText(siblings.shift());
      muted = consumeSiblingText(siblings.shift());
      showControls = consumeSiblingText(siblings.shift());
    }
		

    Array.from(block.children).forEach((child) => {
				child.style.display = 'none';
		});

    if (autoplay) {
      params.autoplay = '1';
    }
    if (loop) {
      params.loop = '1';
    }
    if (muted) {
      params.muted = '1';  // or params.playback = 'muted';
    }

    // Controls behavior depends on the viewer version; simplest pattern:
    if (!showControls) {
      params.hidecontrolbar = '1';
    }

    // Instantiate viewer
    const s7videoviewer = new window.dmviewers.VideoViewer({
      containerId: block.id,
      params,
    });
    s7videoviewer.init();
  } else{
     Array.from(block.children).forEach((child) => {
      child.style.display = 'none';
    });
  }
}
