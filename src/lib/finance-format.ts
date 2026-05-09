/**
 * 财务展示层格式化工具 — 给 /finance 各表共用
 *
 * 老板 5/9 报：待审凭证表里贷列被「其他货币资金-0x3cbDE679...749c钱包」这种
 * 整段塞 40-hex 地址的字串撑爆，把摘要列挤成单字断行。
 *
 * 这里把账户名里嵌的 EVM 地址 (0x + 40 hex) 缩成 0x{4 头}…{4 尾} 形式，整段
 * 文字保留（"其他货币资金-…钱包"），只压地址。完整 raw 字符串走 title attr
 * 给鼠标 hover 看，移动端长按也能看见 (iOS 长按链接显示 title)。
 */

const ETH_ADDRESS_RE = /0x[a-fA-F0-9]{40}/g;

/**
 * 0x3cbDE679FE3C9a7D26BD01148A5d1FbF6126749c → 0x3cbD…749c
 * 不影响其他文字，多个地址全部命中。
 */
export function shortenEthAddressesIn(s: string): string {
  return s.replace(ETH_ADDRESS_RE, (m) => `${m.slice(0, 6)}…${m.slice(-4)}`);
}
