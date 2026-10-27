// Minimal GDSII reader for the headless runs (same record handling as Layout Studio's parseGDSAsync, synchronous)
export function parseGDS(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), lib = { name: 'x', userUnit: 1e-3, dbUnit: 1e-9, cells: [], cellMap: {} };
  const ibmD = o => { const sg = (v.getUint8(o) & 0x80) ? -1 : 1, ex = (v.getUint8(o) & 0x7F) - 64; let m = 0; for (let i = 1; i < 8; i++) m = m * 256 + v.getUint8(o + i); m /= Math.pow(256, 7); return m ? sg * m * Math.pow(16, ex) : 0; };
  const gStr = (o, l) => { let s = ''; for (let i = 0; i < l; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  let off = 0, cell = null, el = null;
  while (off + 4 <= v.byteLength) {
    const len = v.getUint16(off); if (len < 4) break; const type = v.getUint8(off + 2), d = off + 4, dl = len - 4; off += len;
    switch (type) {
      case 0x02: lib.name = gStr(d, dl); break; case 0x03: lib.userUnit = ibmD(d); lib.dbUnit = ibmD(d + 8); break;
      case 0x05: cell = { name: '', elements: [] }; break; case 0x06: cell.name = gStr(d, dl); lib.cells.push(cell); lib.cellMap[cell.name] = cell; break;
      case 0x07: cell = null; break;
      case 0x08: el = { type: 'boundary', layer: 0, datatype: 0, xy: [] }; cell.elements.push(el); break;
      case 0x09: el = { type: 'path', layer: 0, datatype: 0, width: 0, xy: [] }; cell.elements.push(el); break;
      case 0x0A: el = { type: 'sref', sname: '', xy: [0, 0], mag: 1 }; cell.elements.push(el); break;
      case 0x0B: el = { type: 'aref', sname: '', xy: [], colrow: [1, 1] }; cell.elements.push(el); break;
      case 0x0C: el = { type: 'text', layer: 0, xy: [] }; cell.elements.push(el); break;
      case 0x0D: if (el) el.layer = v.getInt16(d); break; case 0x0E: if (el) el.datatype = v.getInt16(d); break;
      case 0x0F: if (el) el.width = v.getInt32(d); break;
      case 0x10: { if (!el) break; const p = []; for (let i = 0; i < dl; i += 8) p.push([v.getInt32(d + i), v.getInt32(d + i + 4)]); el.xy = el.type === 'sref' ? p[0] : p; break; }
      case 0x11: el = null; break; case 0x12: if (el) el.sname = gStr(d, dl); break;
      case 0x13: if (el) el.colrow = [v.getInt16(d), v.getInt16(d + 2)]; break;
      case 0x1B: if (el) el.mag = ibmD(d); break; case 0x1C: if (el) el.angle = ibmD(d); break;
    }
  }
  return lib;
}
