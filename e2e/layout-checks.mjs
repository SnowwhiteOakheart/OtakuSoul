// Shared DOM geometry & occlusion checks for E2E tests: verifies that dialogs, menus,
// popovers, drawers, and UI boxes fit the viewport, are not clipped by overflow ancestors,
// do not overflow horizontally, and are not covered by other elements (via elementFromPoint).
import assert from 'node:assert/strict';

/**
 * Inspects all visible `[role="dialog"]` elements in the current DOM and returns an array of
 * problem descriptions (empty array = clean).
 */
export const collectDialogProblems = (browser, where) =>
  browser.execute((contextLabel) => {
    const problems = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const isTransparent = (bg) => !bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)';

    const hasVisibleSurface = (el) => {
      const s = getComputedStyle(el);
      if (!isTransparent(s.backgroundColor) || s.backgroundImage !== 'none') return true;
      for (const child of el.children) {
        const cs = getComputedStyle(child);
        if (!isTransparent(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
      }
      return false;
    };

    const zIndexOf = (el) => {
      let cur = el;
      let maxZ = 0;
      while (cur && cur !== document.documentElement) {
        const z = Number.parseInt(getComputedStyle(cur).zIndex, 10);
        if (!Number.isNaN(z) && z > maxZ) maxZ = z;
        cur = cur.parentElement;
      }
      return maxZ;
    };

    const describeEl = (el) => {
      if (!el) return 'nichts';
      const owner = el.closest('button, a, header, nav, aside, [role]') || el;
      const tag = el.tagName.toLowerCase();
      const label = owner.getAttribute?.('aria-label') || owner.getAttribute?.('title') || '';
      if (owner !== el) {
        return `<${tag}> in <${owner.tagName.toLowerCase()}${label ? ` "${label}"` : ''}>`;
      }
      return `<${tag}${el.id ? `#${el.id}` : ''}${label ? ` "${label}"` : ''}>`;
    };

    const checkAncestorClip = (target, rect, skipNode) => {
      let passedFixed = getComputedStyle(target).position === 'fixed';
      let cur = target.parentElement;
      while (cur && cur !== document.documentElement) {
        const cs = getComputedStyle(cur);
        if (cur === skipNode) {
          if (cs.position === 'fixed') passedFixed = true;
          cur = cur.parentElement;
          continue;
        }
        const trapsFixed =
          cs.transform !== 'none' ||
          cs.filter !== 'none' ||
          cs.backdropFilter !== 'none' ||
          cs.perspective !== 'none';
        if (!passedFixed || trapsFixed) {
          const cr = cur.getBoundingClientRect();
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
              (rect.left < cr.left - 1 || rect.right > cr.right + 1)) {
            return `horizontal abgeschnitten durch ${describeEl(cur)}`;
          }
          if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              (rect.top < cr.top - 1 || rect.bottom > cr.bottom + 1)) {
            return `vertikal abgeschnitten durch ${describeEl(cur)}`;
          }
        }
        if (cs.position === 'fixed') passedFixed = true;
        cur = cur.parentElement;
      }
      return null;
    };

    const isInVisibleScrollArea = (el, container) => {
      const er = el.getBoundingClientRect();
      if (er.width < 2 || er.height < 2) return false;
      const cx = er.left + er.width / 2;
      const cy = er.top + er.height / 2;
      if (cx < 1 || cx > vw - 1 || cy < 1 || cy > vh - 1) return false;
      let cur = el.parentElement;
      while (cur && cur !== container.parentElement) {
        const s = getComputedStyle(cur);
        const clipsY = s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'hidden' || s.overflowY === 'clip';
        const clipsX = s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip';
        if (clipsY || clipsX) {
          const cr = cur.getBoundingClientRect();
          if (clipsX && (cx < cr.left + 1 || cx > cr.right - 1)) return false;
          if (clipsY && (cy < cr.top + 1 || cy > cr.bottom - 1)) return false;
        }
        cur = cur.parentElement;
      }
      return true;
    };

    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    if (dialogs.length === 0) {
      problems.push(`${contextLabel}: kein sichtbarer Dialog gefunden`);
      return problems;
    }

    // Pick topmost open dialog by highest computed z-index (last in DOM wins ties).
    const topmost = dialogs.reduce((best, cur) => (zIndexOf(cur) >= zIndexOf(best) ? cur : best), dialogs[0]);

    for (const dialog of dialogs) {
      const label =
        dialog.getAttribute('aria-label') ||
        (dialog.getAttribute('aria-labelledby')
          ? document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent?.trim()
          : '') ||
        dialog.firstElementChild?.querySelector('h1, h2, h3, h4')?.textContent?.trim() ||
        'Dialog';

      const dr = dialog.getBoundingClientRect();
      const isBackdropModal = dr.width >= vw - 4 && dr.height >= vh - 4;
      const isPopover = !isBackdropModal && !!dialog.parentElement?.querySelector('[aria-haspopup="dialog"]');
      const panel = isBackdropModal ? (dialog.firstElementChild ?? dialog) : dialog;
      const pr = panel.getBoundingClientRect();

      if (pr.width < 20 || pr.height < 20) {
        problems.push(`${contextLabel} (${label}): Dialogfeld kollabiert (${Math.round(pr.width)}×${Math.round(pr.height)})`);
        continue;
      }

      if (!hasVisibleSurface(panel)) {
        problems.push(`${contextLabel} (${label}): Dialogfeld ohne sichtbaren Hintergrund/Rahmen`);
      }

      // If this is not a popover anchored to a trigger, it must be a full-screen modal overlay.
      if (!isPopover && !isBackdropModal) {
        problems.push(`${contextLabel} (${label}): Modal-Backdrop deckt Fenster nicht ab (${Math.round(dr.width)}×${Math.round(dr.height)} bei ${vw}×${vh})`);
      }

      // Viewport fit check (allow small 1px subpixel rounding).
      if (pr.top < -1 || pr.left < -1 || pr.bottom > vh + 1 || pr.right > vw + 1) {
        problems.push(
          `${contextLabel} (${label}): Dialog ragt aus Fenster (${Math.round(pr.left)},${Math.round(pr.top)}–${Math.round(pr.right)},${Math.round(pr.bottom)} bei ${vw}×${vh})`,
        );
      }

      // Ancestor overflow clipping check (respecting CSS position:fixed containing blocks).
      const clipProblem = checkAncestorClip(panel, pr, isBackdropModal ? dialog : null);
      if (clipProblem) {
        problems.push(`${contextLabel} (${label}): ${clipProblem}`);
      }

      // Horizontal internal overflow check.
      if (panel.scrollWidth > panel.clientWidth + 2) {
        problems.push(`${contextLabel} (${label}): horizontaler Überlauf im Dialog (${panel.scrollWidth} > ${panel.clientWidth})`);
      }

      // Occlusion check only on the topmost dialog so parent modals behind it do not false-positive.
      if (dialog === topmost) {
        if (isBackdropModal) {
          for (const [bx, by, desc] of [
            [12, 12, 'Ecke oben links'],
            [vw / 2, 12, 'Kopfzeilen-Mitte'],
          ]) {
            const hit = document.elementFromPoint(bx, by);
            if (!hit || !dialog.contains(hit)) {
              problems.push(`${contextLabel} (${label}): Modal-Backdrop an ${desc} verdeckt durch ${describeEl(hit)}`);
            }
          }
        }

        const rightPad = panel.scrollHeight > panel.clientHeight ? 22 : 12;
        const left = Math.max(1, pr.left + 12);
        const right = Math.min(vw - 2, pr.right - rightPad);
        const top = Math.max(1, pr.top + 12);
        const bottom = Math.min(vh - 2, pr.bottom - 12);
        const cx = Math.min(vw - 2, Math.max(1, pr.left + pr.width / 2));
        const cy = Math.min(vh - 2, Math.max(1, pr.top + pr.height / 2));

        const samplePoints = [
          [left, top, 'oben links'],
          [right, top, 'oben rechts'],
          [cx, top, 'oben mittig'],
          [left, bottom, 'unten links'],
          [right, bottom, 'unten rechts'],
          [cx, bottom, 'unten mittig'],
          [cx, cy, 'Mitte'],
        ];

        for (const [px, py, posLabel] of samplePoints) {
          if (px > right || py > bottom) continue;
          const hit = document.elementFromPoint(px, py);
          if (!hit || !panel.contains(hit)) {
            problems.push(`${contextLabel} (${label}): Dialogbereich (${posLabel}) verdeckt durch ${describeEl(hit)}`);
            break;
          }
        }

        // Check visible interactive controls & headings inside the panel.
        for (const ctrl of panel.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="radio"], [role="option"], h1, h2, h3, h4')) {
          if (!isVisible(ctrl) || !isInVisibleScrollArea(ctrl, panel)) continue;
          const cr = ctrl.getBoundingClientRect();
          const hx = cr.left + cr.width / 2;
          const hy = cr.top + cr.height / 2;
          const hit = document.elementFromPoint(hx, hy);
          if (!hit || !panel.contains(hit)) {
            const ctrlName = (ctrl.getAttribute('aria-label') || ctrl.textContent || ctrl.tagName).trim().slice(0, 40);
            problems.push(`${contextLabel} (${label}): Element „${ctrlName}“ verdeckt durch ${describeEl(hit)}`);
            break;
          }
        }
      }
    }

    return problems;
  }, where);

/**
 * Inspects a floating or inline box (menu, listbox, popover, sidebar, banner) for viewport bounds,
 * ancestor overflow clipping, internal horizontal overflow, and occlusion via elementFromPoint.
 */
export const collectBoxProblems = (browser, selector, where, { checkItems = true } = {}) =>
  browser.execute((sel, contextLabel, shouldCheckItems) => {
    const problems = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxes = [...document.querySelectorAll(sel)].filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
    });

    if (boxes.length === 0) {
      problems.push(`${contextLabel}: Box „${sel}“ nicht sichtbar`);
      return problems;
    }

    const describeEl = (el) => {
      if (!el) return 'nichts';
      const owner = el.closest('button, a, header, nav, aside, [role]') || el;
      const tag = el.tagName.toLowerCase();
      const label = owner.getAttribute?.('aria-label') || owner.getAttribute?.('title') || '';
      if (owner !== el) {
        return `<${tag}> in <${owner.tagName.toLowerCase()}${label ? ` "${label}"` : ''}>`;
      }
      return `<${tag}${el.id ? `#${el.id}` : ''}${label ? ` "${label}"` : ''}>`;
    };

    const isVisible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 1 && r.height > 1;
    };

    for (const box of boxes) {
      const r = box.getBoundingClientRect();
      if (r.top < -1 || r.left < -1 || r.bottom > vh + 1 || r.right > vw + 1) {
        problems.push(
          `${contextLabel}: Box ragt aus Fenster (${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)} bei ${vw}×${vh})`,
        );
      }

      // Ancestor clipping check (respecting CSS position:fixed containing blocks).
      let passedFixed = getComputedStyle(box).position === 'fixed';
      let cur = box.parentElement;
      while (cur && cur !== document.documentElement) {
        const cs = getComputedStyle(cur);
        const trapsFixed =
          cs.transform !== 'none' ||
          cs.filter !== 'none' ||
          cs.backdropFilter !== 'none' ||
          cs.perspective !== 'none';
        if (!passedFixed || trapsFixed) {
          const cr = cur.getBoundingClientRect();
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
              (r.left < cr.left - 1 || r.right > cr.right + 1)) {
            problems.push(`${contextLabel}: Box horizontal abgeschnitten durch ${describeEl(cur)}`);
            break;
          }
          if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
              (r.top < cr.top - 1 || r.bottom > cr.bottom + 1)) {
            problems.push(`${contextLabel}: Box vertikal abgeschnitten durch ${describeEl(cur)}`);
            break;
          }
        }
        if (cs.position === 'fixed') passedFixed = true;
        cur = cur.parentElement;
      }

      if (box.scrollWidth > box.clientWidth + 2) {
        problems.push(`${contextLabel}: horizontaler Überlauf in Box (${box.scrollWidth} > ${box.clientWidth})`);
      }

      // Sample box corners + center.
      const rightPad = box.scrollHeight > box.clientHeight ? 20 : 8;
      const left = Math.max(1, r.left + 8);
      const right = Math.min(vw - 2, r.right - rightPad);
      const top = Math.max(1, r.top + 8);
      const bottom = Math.min(vh - 2, r.bottom - 8);
      const cx = Math.min(vw - 2, Math.max(1, r.left + r.width / 2));
      const cy = Math.min(vh - 2, Math.max(1, r.top + r.height / 2));

      for (const [px, py, posLabel] of [
        [left, top, 'oben links'],
        [right, top, 'oben rechts'],
        [left, bottom, 'unten links'],
        [right, bottom, 'unten rechts'],
        [cx, cy, 'Mitte'],
      ]) {
        if (px > right || py > bottom) continue;
        const hit = document.elementFromPoint(px, py);
        if (!hit || !box.contains(hit)) {
          problems.push(`${contextLabel}: Box (${posLabel}) verdeckt durch ${describeEl(hit)}`);
          break;
        }
      }

      if (shouldCheckItems) {
        for (const item of box.querySelectorAll('[role^="menuitem"], [role="option"], button, a[href], input:not([type="hidden"]), [role="tab"]')) {
          if (!isVisible(item)) continue;
          const ir = item.getBoundingClientRect();
          if (ir.top < r.top + 1 || ir.bottom > r.bottom - 1 || ir.left < r.left + 1 || ir.right > r.right - 1) continue;
          const hx = Math.min(vw - 2, Math.max(1, ir.left + ir.width / 2));
          const hy = Math.min(vh - 2, Math.max(1, ir.top + ir.height / 2));
          const hit = document.elementFromPoint(hx, hy);
          if (!hit || !box.contains(hit)) {
            const label = (item.getAttribute('aria-label') || item.textContent || item.tagName).trim().slice(0, 40);
            problems.push(`${contextLabel}: Eintrag „${label}“ verdeckt durch ${describeEl(hit)}`);
            break;
          }
        }
      }
    }

    return problems;
  }, selector, where, checkItems);

/**
 * Checks that sibling boxes/controls inside a container do not overlap each other or overflow the container.
 */
export const collectSiblingOverlapProblems = (browser, containerSelector, itemSelector, where) =>
  browser.execute((cSel, iSel, contextLabel) => {
    const problems = [];
    const container = document.querySelector(cSel);
    if (!container) return [`${contextLabel}: Container „${cSel}“ nicht gefunden`];
    const cr = container.getBoundingClientRect();
    const items = [...container.querySelectorAll(iSel)]
      .filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 32),
        r: el.getBoundingClientRect(),
      }));

    for (const item of items) {
      if (item.r.left < cr.left - 1 || item.r.right > cr.right + 1 || item.r.top < cr.top - 1 || item.r.bottom > cr.bottom + 1) {
        problems.push(`${contextLabel}: „${item.name}“ ragt über Container hinaus`);
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i].r;
        const b = items[j].r;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
          problems.push(`${contextLabel}: „${items[i].name}“ überlappt „${items[j].name}“`);
        }
      }
    }
    return problems;
  }, containerSelector, itemSelector, where);

export const assertDialogClean = async (browser, where) => {
  const problems = await collectDialogProblems(browser, where);
  assert.deepEqual(problems, [], `${where}: Dialog-Probleme:\n${problems.join('\n')}`);
};

export const assertBoxClean = async (browser, selector, where, opts) => {
  const problems = await collectBoxProblems(browser, selector, where, opts);
  assert.deepEqual(problems, [], `${where}: Box-Probleme:\n${problems.join('\n')}`);
};
