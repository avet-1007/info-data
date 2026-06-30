/* ============================================================================
 * drawio.js — .drawio diagrams via the embedded diagrams.net editor.
 *
 * Loads embed.diagrams.net in an iframe and talks the JSON embed protocol:
 * on `init` we push the file's XML; on `autosave`/`save` we get edited XML back
 * and persist it. This gives both viewing and full editing in one. Needs
 * internet (the editor is hosted by diagrams.net).
 *
 *   Drawio.isDrawio(path)
 *   Drawio.open(xml, host, onSave)   render + edit; onSave(xml) on every change
 *   Drawio.dispose()
 * ==========================================================================*/

const Drawio = (() => {
  const EMBED = 'https://embed.diagrams.net/?embed=1&proto=json&ui=dark&spin=1'
              + '&modified=unsavedChanges&libraries=1&noSaveBtn=1&noExitBtn=1&keepmodified=1';

  let iframe = null, host = null, onSave = null, currentXml = '', handler = null;

  const isDrawio = path => /\.drawio$/i.test(path || '');

  function open(xml, host_, onSaveCb) {
    dispose();
    host = host_; onSave = onSaveCb; currentXml = xml || '';

    iframe = document.createElement('iframe');
    iframe.className = 'drawio-frame';
    iframe.src = EMBED;
    host.appendChild(iframe);

    handler = e => {
      if (!iframe || e.source !== iframe.contentWindow) return;
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      switch (msg.event) {
        case 'init':
          // hand the diagram to the editor; autosave streams edits back
          iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml: currentXml, autosave: 1 }), '*');
          break;
        case 'autosave':
        case 'save':
          currentXml = msg.xml;
          if (onSave) onSave(msg.xml);
          break;
      }
    };
    window.addEventListener('message', handler);
  }

  function dispose() {
    if (handler) { window.removeEventListener('message', handler); handler = null; }
    if (iframe) { iframe.remove(); iframe = null; }
    host = null; onSave = null;
  }

  return { isDrawio, open, dispose };
})();

window.Drawio = Drawio;
