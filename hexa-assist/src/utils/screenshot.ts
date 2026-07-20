/**
 * screenshot.ts
 *
 * Captures the full content of a SidePanel as a high-quality PNG.
 *
 * Strategy:
 *   The panel is position:fixed with a CSS transform — html2canvas
 *   cannot reliably capture fixed elements in-place. Instead we:
 *     1. Clone the panel content into a temporary off-screen container
 *     2. Expand it to full natural height (no overflow clipping)
 *     3. Inject a timestamp footer visible in the image
 *     4. Capture with html2canvas at 2× scale
 *     5. Remove the temporary container and download the PNG
 */

import html2canvas from 'html2canvas';

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function formatDisplayTimestamp(d: Date): string {
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:      '2-digit',
    month:    'short',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
    hour12:   false,
  }) + ' IST';
}

export async function captureScreenshot(
  panelEl:  HTMLElement,
  hostname: string,
): Promise<void> {
  const now       = new Date();
  const ts        = formatTimestamp(now);
  const displayTs = formatDisplayTimestamp(now);
  const safeName  = (hostname || 'device').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename  = `${safeName}_${ts}.png`;

  // Resolve the panel's current background colour before cloning
  const bg = getComputedStyle(panelEl).backgroundColor || '#ffffff';

  // ── 1. Create an off-screen wrapper ──────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position: absolute',
    'top: -99999px',
    'left: -99999px',
    `width: ${panelEl.offsetWidth}px`,
    'overflow: visible',
    `background: ${bg}`,
    'font-family: var(--font, system-ui, sans-serif)',
  ].join(';');

  // ── 2. Clone the panel content ───────────────────────────────────────────
  const clone = panelEl.cloneNode(true) as HTMLElement;

  // Reset positioning so the clone renders as a normal block
  clone.style.position  = 'relative';
  clone.style.transform = 'none';
  clone.style.top       = '0';
  clone.style.right     = '0';
  clone.style.height    = 'auto';
  clone.style.overflow  = 'visible';
  clone.style.maxHeight = 'none';
  clone.style.width     = '100%';
  clone.style.boxShadow = 'none';
  clone.style.border    = 'none';

  // Remove the CSS transition so it doesn't animate during capture
  clone.style.transition = 'none';

  // Expand the scrollable body inside the clone
  const bodyEl = clone.querySelector<HTMLElement>('[class*="body"]');
  if (bodyEl) {
    bodyEl.style.overflow  = 'visible';
    bodyEl.style.maxHeight = 'none';
    bodyEl.style.height    = 'auto';
    bodyEl.style.flex      = 'none';
  }

  // ── 3. Add timestamp footer ───────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.style.cssText = [
    'padding: 10px 24px 14px',
    'font-size: 11px',
    'color: #666',
    'border-top: 1px solid #e2e8f0',
    'display: flex',
    'justify-content: space-between',
    'align-items: center',
    `background: ${bg}`,
    'font-family: system-ui, sans-serif',
  ].join(';');
  footer.innerHTML = `
    <span style="font-weight:600;color:#374151">${hostname || 'Device'}</span>
    <span>Captured: ${displayTs}</span>
  `;
  clone.appendChild(footer);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // ── 4. Wait for layout to settle ─────────────────────────────────────────
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve));

  // ── 5. Capture ────────────────────────────────────────────────────────────
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale:           2,
      useCORS:         true,
      allowTaint:      true,
      backgroundColor: bg,
      logging:         false,
      width:           clone.scrollWidth,
      height:          clone.scrollHeight,
      windowWidth:     clone.scrollWidth,
      windowHeight:    clone.scrollHeight,
      x:               0,
      y:               0,
    });
  } finally {
    document.body.removeChild(wrapper);
  }

  // ── 6. Download ───────────────────────────────────────────────────────────
  canvas.toBlob(blob => {
    if (!blob) return;
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href      = url;
    link.download  = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
