/* Client-side cropper. Only processed WebP blobs, never the full local file,
   are uploaded. Same official crop is reused for all SDN views. */
(() => {
  'use strict';
  const aspect = 4 / 5;
  const WIDTH = 400, HEIGHT = 500;
  const MAX_SOURCE = 1024 * 1024;
  const canvasToBlob = (canvas, quality = .86) => new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('WebP-Konvertierung fehlgeschlagen.')), 'image/webp', quality));
  const imageFromBlob = async blob => {
    if (!(blob instanceof Blob) || !['image/jpeg','image/png','image/webp'].includes(blob.type))
      throw new Error('Nur PNG-, JPEG- oder WebP-Bilder werden akzeptiert.');
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      if (img.naturalWidth < 160 || img.naturalHeight < 160) throw new Error('Das Bild ist zu klein (mindestens 160 × 160 Pixel).');
      return { img, url };
    } catch (e) { URL.revokeObjectURL(url); throw e; }
  };
  async function compressSource(blob) {
    const {img, url} = await imageFromBlob(blob);
    try {
      const ratio = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * ratio); c.height = Math.round(img.naturalHeight * ratio);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let quality = .91, result = await canvasToBlob(c, quality);
      while (result.size > MAX_SOURCE && quality > .48) { quality -= .09; result = await canvasToBlob(c, quality); }
      if (result.size > MAX_SOURCE) throw new Error('Bild zu groß. Bitte eine kleinere Datei wählen.');
      return result;
    } finally { URL.revokeObjectURL(url); }
  }
  function build() {
    if (document.getElementById('sdnCropDialog')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="sdnCropDialog" class="sdn-crop-dialog" aria-labelledby="sdnCropTitle">
        <div class="sdn-crop-header"><div><small>SDN / IMAGE PROCESSOR</small><h2 id="sdnCropTitle">PORTRAITAUSSCHNITT</h2></div><button type="button" id="sdnCropCancelX" aria-label="Schließen">×</button></div>
        <p class="sdn-crop-hint">Bild mit der Maus oder dem Finger verschieben. Über den Regler hineinzoomen. Der sichtbare Ausschnitt wird dauerhaft für alle Aktenansichten verwendet.</p>
        <div class="sdn-crop-content"><canvas id="sdnCropCanvas" width="400" height="500" aria-label="Verschiebbarer Bildausschnitt"></canvas><div class="sdn-crop-side"><label>ZOOM <input id="sdnCropZoom" type="range" min="1" max="3" step="0.01" value="1"></label><p>VORSCHAU<br><small>OFFIZIELLES PORTRAIT · 4:5</small></p><canvas id="sdnCropThumb" width="160" height="200" aria-label="Portraitvorschau"></canvas><p class="sdn-crop-size">Ausgabe: 400 × 500 Pixel, WebP, maximal 1 MB.</p></div></div>
        <div class="sdn-crop-footer"><button type="button" id="sdnCropCancel">ABBRECHEN</button><button type="button" id="sdnCropSave">AUSSCHNITT ÜBERNEHMEN ↗</button></div>
      </dialog>`);
  }
  async function edit(blob, previousCrop = null) {
    build();
    const source = await compressSource(blob);
    const {img, url} = await imageFromBlob(source);
    const dlg = document.getElementById('sdnCropDialog');
    const c = document.getElementById('sdnCropCanvas'), ctx = c.getContext('2d');
    const thumb = document.getElementById('sdnCropThumb'), thctx = thumb.getContext('2d');
    const slider = document.getElementById('sdnCropZoom');
    let scale = Math.max(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight),
      zoom = 1, offsetX = 0, offsetY = 0;
    const clamp = () => {
      const w = img.naturalWidth * scale * zoom, h = img.naturalHeight * scale * zoom;
      offsetX = Math.max(WIDTH - w, Math.min(0, offsetX));
      offsetY = Math.max(HEIGHT - h, Math.min(0, offsetY));
    };
    if (previousCrop && [previousCrop.x,previousCrop.y,previousCrop.width,previousCrop.height].every(Number.isFinite) && previousCrop.width > 0) {
      // Previous coordinates are fractions of the normalized source image.
      zoom = Math.max(1, Math.min(3, WIDTH / (previousCrop.width * img.naturalWidth * scale)));
      slider.value = String(zoom);
      offsetX = -previousCrop.x * img.naturalWidth * scale * zoom;
      offsetY = -previousCrop.y * img.naturalHeight * scale * zoom;
    } else {
      zoom = 1; slider.value = '1';
      offsetX = (WIDTH - img.naturalWidth * scale) / 2;
      offsetY = (HEIGHT - img.naturalHeight * scale) / 2;
    }
    const draw = () => {
      clamp();
      ctx.clearRect(0,0,WIDTH,HEIGHT);
      ctx.drawImage(img,offsetX,offsetY,img.naturalWidth*scale*zoom,img.naturalHeight*scale*zoom);
      thctx.clearRect(0,0,160,200); thctx.drawImage(c,0,0,160,200);
    };
    draw();
    let pointer = null;
    const down = e => { pointer = { id:e.pointerId, x:e.clientX, y:e.clientY, ox:offsetX, oy:offsetY }; c.setPointerCapture(e.pointerId); };
    const move = e => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const r=c.getBoundingClientRect();offsetX=pointer.ox+(e.clientX-pointer.x)*WIDTH/r.width;offsetY=pointer.oy+(e.clientY-pointer.y)*HEIGHT/r.height;draw();
    };
    const up = e => { if(pointer?.id===e.pointerId) pointer=null; };
    const zoomHandler = () => {
      const old = zoom, next = Number(slider.value);
      const imageX = (WIDTH/2-offsetX)/(scale*old), imageY = (HEIGHT/2-offsetY)/(scale*old);
      zoom=next;offsetX=WIDTH/2-imageX*scale*zoom;offsetY=HEIGHT/2-imageY*scale*zoom;draw();
    };
    c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
    slider.addEventListener('input',zoomHandler);
    dlg.showModal();
    try {
      return await new Promise((resolve,reject) => {
        const save=document.getElementById('sdnCropSave'),cancel=document.getElementById('sdnCropCancel'),x=document.getElementById('sdnCropCancelX');
        let complete=false;
        const cleanup=()=>{ save.removeEventListener('click',onSave);cancel.removeEventListener('click',onCancel);x.removeEventListener('click',onCancel);dlg.removeEventListener('cancel',onClose); };
        const onSave=async()=>{
          if(complete)return;complete=true;save.disabled=true;
          try {
            const output=await canvasToBlob(c,.87);
            if(output.size>MAX_SOURCE)throw new Error('Das Ergebnis ist größer als 1 MB.');
            const f=scale*zoom;
            const crop={x:Math.max(0,-offsetX/f/img.naturalWidth), y:Math.max(0,-offsetY/f/img.naturalHeight),
              width:WIDTH/f/img.naturalWidth,height:HEIGHT/f/img.naturalHeight};
            cleanup();dlg.close();resolve({ source, preview:output, crop });
          } catch(err){complete=false;save.disabled=false;alert(err.message);}
        };
        const onCancel=()=>{cleanup();dlg.close();resolve(null);};
        const onClose=e=>{e.preventDefault();onCancel();};
        save.disabled=false;save.addEventListener('click',onSave);cancel.addEventListener('click',onCancel);x.addEventListener('click',onCancel);dlg.addEventListener('cancel',onClose);
      });
    } finally { slider.removeEventListener('input',zoomHandler);c.removeEventListener('pointerdown',down);c.removeEventListener('pointermove',move);c.removeEventListener('pointerup',up);c.removeEventListener('pointercancel',up);URL.revokeObjectURL(url); }
  }
  window.SDNPortraitEditor = {edit};
})();
