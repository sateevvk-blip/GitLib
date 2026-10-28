import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Минимальный ZIP-архиватор: deflate, UTF-8 имена, unix-права (чтобы .sh и .command
 * остались исполняемыми после распаковки на macOS и Linux).
 */
export function writeZip(srcDir, target, prefix, executables) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(srcDir);
  files.sort();

  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const rel = path.relative(srcDir, file).split(path.sep).join('/');
    const nameBuf = Buffer.from(`${prefix}/${rel}`, 'utf8');
    const data = fs.readFileSync(file);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = zlib.crc32(data);
    const mode = executables.has(rel) ? 0o100755 : 0o100644;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия для распаковки
    local.writeUInt16LE(0x0800, 6); // имена в UTF-8
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE((3 << 8) | 20, 4); // создан в unix — права читаются из external attrs
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(stored ? 0 : 8, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    header.writeUInt32LE((mode << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  if (files.length > 0xffff || offset > 0xffffffff) throw new Error('Архив слишком большой для ZIP без ZIP64');
  fs.writeFileSync(target, Buffer.concat([...chunks, ...central, end]));
  return files.length;
}
