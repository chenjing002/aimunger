// Cross-section links on aimunger.com: 管理层讨论与分析 ↔ 致股东信 ↔ 数据图表.
// Keyed by company slug; shown on company hub pages when an entry exists.
export const RELATED_LINKS: Record<string, { label: string; href: string }[]> = {
  vanke: [
    { label: '万科 A 致股东信合集', href: 'https://aimunger.com/letters/company/vanke/' },
    { label: '万科 A 合同负债数据图表', href: 'https://aimunger.com/data/vanke-contract-liabilities/' },
    { label: '万科 A 有息负债及结构数据图表', href: 'https://aimunger.com/data/vanke-interest-bearing-debt/' },
    { label: '万科 A 开发业务毛利率数据图表', href: 'https://aimunger.com/data/vanke-development-gross-margin/' },
  ],
  onewo: [
    { label: '万物云 致股东信合集', href: 'https://aimunger.com/letters/company/onewo/' },
  ],
};
