function parseCurrentSettings(rawdata) {
  // 预处理行：去掉空行与 OK
  const lines = rawdata
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && l !== 'OK');

  const find = (prefix) => lines.find(l => l.startsWith(prefix));

  // --- SIM 槽 ---
  let sim = '-';
  const simLine = find('+QUIMSLOT:');
  if (simLine) {
    const parts = simLine.split(':');
    if (parts[1]) sim = parts[1].trim();
  }

  // --- APN（从 +CGCONTRDP: 读取 profile 1）---
  let apn = '-';
  const contrdpLine = find('+CGCONTRDP:');
  if (contrdpLine) {
    const m = contrdpLine.match(/\+CGCONTRDP:\s*1\s*,\s*\d+\s*,\s*"([^"]+)"/);
    if (m) apn = m[1];
  }

  // --- 小区锁定状态 ---
  let cellLock4GStatus = '0';
  let cellLock5GStatus = '0';
  const lock4g = find('+QNWLOCK: "common/4g"');
  const lock5g = find('+QNWLOCK: "common/5g"');
  if (lock4g) { const m = lock4g.match(/,\s*([0-9]+)/); if (m) cellLock4GStatus = m[1]; }
  if (lock5g) { const m = lock5g.match(/,\s*([0-9]+)/); if (m) cellLock5GStatus = m[1]; }

  let cellLockStatus = 'unlocked';
  if (cellLock4GStatus !== '0' && cellLock5GStatus !== '0') cellLockStatus = '4G and 5G are locked in';
  else if (cellLock4GStatus !== '0') cellLockStatus = '4G locked';
  else if (cellLock5GStatus !== '0') cellLockStatus = '5G locked';

  // --- 首选网络 ---
  let prefNetwork = '-';
  const prefLine = find('+QNWPREFCFG: "mode_pref"');
  if (prefLine) {
    const m = prefLine.match(/,\s*([A-Z0-9:+]+)/i);
    if (m) prefNetwork = m[1];
  }

  // --- NR 禁用模式（转中文）---
  let nrModeControlNum = '0';
  const nrCtl = find('+QNWPREFCFG: "nr5g_disable_mode"');
  if (nrCtl) {
    const m = nrCtl.match(/,\s*([0-9]+)/);
    if (m) nrModeControlNum = m[1];
  }
  const nrModeControl =
    nrModeControlNum === '0' ? 'not disabled' :
    nrModeControlNum === '1' ? 'Disable SA' :
    'Disable NSA';

  // --- 频段：只从 +QCAINFO: 提取，保留重复和顺序 ---
  // 绝不看 +CGDCONT: 行，避免 0.0.0.0… 混入
  const qcaLines = lines.filter(l => l.startsWith('+QCAINFO:'));
  const bandsArr = [];

  for (const l of qcaLines) {
    // 去前缀后做“带引号 CSV”切分，防止逗号误拆
    const raw = l.replace(/^\+QCAINFO:\s*/, '');
    const fields = (raw.match(/"[^"]*"|[^,]+/g) || [])
      .map(s => s.replace(/^"|"$/g, '').trim());

    // 形如：TYPE, ARFCN, BW, "BAND NAME", ...
    // 只取 TYPE 和 第4个字段（BAND NAME）
    const type = (fields[0] || '').toUpperCase(); // PCC/SCC/...
    const band = fields[3] || '';

    if (band) bandsArr.push({ type, band }); // 保留重复
  }

  // 排序：PCC 在前、SCC 其次，其它其后；同类保持原顺序
  const order = { PCC: 0, SCC: 1 };
  const bandsSorted = bandsArr
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => {
      const oa = order[a.type] ?? 2;
      const ob = order[b.type] ?? 2;
      if (oa !== ob) return oa - ob;
      return a.i - b.i;
    });

  const bands = bandsSorted.length ? bandsSorted.map(x => x.band).join(' / ') : '-';

  // --- PDP 类型（可选，供 UI 显示“当前: …”）---
  let pdpType = '-';
  const c1 = lines.find(l => /^\+CGDCONT:\s*1,/.test(l));
  if (c1) {
    const m = c1.match(/\+CGDCONT:\s*1\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"/);
    if (m) {
      pdpType = m[1];                    // IP / IPV6 / IPV4V6
      if ((apn === '-' || !apn) && m[2]) apn = m[2]; // 若上面没取到 APN，则用这里的
    }
  }

  return { sim, apn, cellLockStatus, prefNetwork, nrModeControl, bands, pdpType };
}
