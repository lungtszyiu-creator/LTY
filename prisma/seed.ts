import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POSITIONS = [
  {
    title: '高层决策（董事长 / CEO）',
    level: 'EXECUTIVE',
    department: '决策层',
    coreResponsibilities:
      '制定公司战略方向、审批重大预算与人员安排、对经营结果负最终责任。\n对董事会与投资人负责，决策一票否决权范围内的事项。',
    kpis: '整体经营结果（收入 / 利润 / 现金流）· 战略目标达成率 · 组织健康度 · 重大风险控制',
    notInTaskPool: '上述决策事项本身不进任务池；但可设任务池邀请下属参与某个战略项目的筹备或落地。',
    order: 10,
  },
  {
    title: '中高层管理',
    level: 'MANAGER',
    department: '各部门负责人',
    coreResponsibilities:
      '带领本部门达成季度 / 年度目标、分配并跟进本职工作、审核下属工作汇报与报销。\n担任本部门的主要 HR 职能（面试、绩效面谈、离职交接）。',
    kpis: '部门 OKR / KPI 完成率 · 下属绩效面谈完成率 · 关键人员稳定性',
    notInTaskPool: '分配给本部门的日常工作、部门周会上已明确的任务，不进任务池。\n例外：跨部门协作、组织改善项目可进任务池。',
    order: 20,
  },
  {
    title: '市场运营',
    level: 'STAFF',
    department: '市场部',
    coreResponsibilities:
      '按排期完成新客户获取 · 维护现有客户关系 · 活动 / 投放执行 · 内容生产与渠道运营。\n月度汇报用户增长与收入数据（手册 § 7.1.3）。',
    kpis: '用户增长数 · 收入贡献 · ROI / 投放效率 · 客户留存',
    notInTaskPool: 'KPI 内的用户增长 / 日常投放 / 月度数据汇总 —— 不进任务池。\n跨部门联动、新渠道试点、增长 Hack 专项可进任务池。',
    order: 30,
  },
  {
    title: '技术 / 产品',
    level: 'STAFF',
    department: '产研部',
    coreResponsibilities:
      'Jira 任务的开发 / 测试 / 发布 · 按排期关闭任务与处理 bug · 参与 code review 与评论（手册 § 7.1.2）。\n维护现有系统稳定性。',
    kpis: 'Jira 任务关闭率 · 评论互动数 · 线上稳定性 · 交付质量（bug 率、复用度）',
    notInTaskPool: '排期内的 feature 开发、日常 bug 修复、code review —— 不进任务池。\n技术升级专项、工具链改造、对外技术分享可进任务池。',
    order: 40,
  },
  {
    title: '人事 / 行政',
    level: 'STAFF',
    department: 'HR 部',
    coreResponsibilities:
      '招聘执行（发布 JD、初筛、面试安排）· 考勤 / 请假审批 · 合同管理与离职交接 · 公司制度宣贯与答疑。',
    kpis: '招聘到岗时效 · 员工满意度 · 合规事项 0 事故',
    notInTaskPool: '上述日常 HR 工作不进任务池。\n新制度调研、员工手册修订、员工培训专项可进任务池。',
    order: 50,
  },
  {
    title: '财务',
    level: 'STAFF',
    department: '财务部',
    coreResponsibilities:
      '报销审核（手册 § 6）· 月度 / 季度财务报表 · 银行 / 税务事项 · 成本预算与实际对账。',
    kpis: '报表准时率 · 账务准确性 · 报销处理时效 · 预算偏差控制',
    notInTaskPool: '日常报销审核、报表出具不进任务池。\n财务流程数字化改造、成本分析专项可进任务池。',
    order: 60,
  },
];

const FAQS = [
  // TASK_POOL
  { category: 'TASK_POOL', order: 10, question: '任务池是本职工作还是额外激励？',
    answer: '额外激励。手册 § 2.5.1 明确写明：任务池是"本职工作之外的额外机会，不纳入固定岗位职责清单"。\n\n你的底薪覆盖岗位说明书里的工作；任务池积分累计到年度考核档案，影响年度奖金与调薪优先权（手册 § 2.5.5）。' },
  { category: 'TASK_POOL', order: 20, question: '日报、周报、月报算任务池里的任务吗？',
    answer: '不算。日报 / 周报 / 月报是手册 § 5.1-5.3 规定的日常汇报义务，属于本职。任务池不会包含这类常规事项。' },
  { category: 'TASK_POOL', order: 30, question: '每人最多能同时领几条任务？',
    answer: '同时进行中（CLAIMED + SUBMITTED 状态）最多 3 条。\n\n这是为了防止"一人接 10 条占着不做"挤走别人机会。想再领必须先完成或释放一条。' },
  { category: 'TASK_POOL', order: 40, question: '谁可以参与任务池？',
    answer: '手册 § 2.5.2：原则上面向全公司，但须同时满足：\n1) 本职工作完成达标；\n2) 绩效评价达到公司认定的优秀水平；\n3) 无重大违纪或诚信问题。\n\n公司可根据实际情况暂停或取消参与资格（如本职掉档）。' },
  { category: 'TASK_POOL', order: 50, question: '任务被驳回后怎么办？',
    answer: '驳回不计分。你可以根据审核意见修改后重新提交；任务状态会回到"进行中"。\n\n若多次驳回或长时间无交付，管理员可直接释放任务让其他人领取（手册 § 2.5.3）。' },
  { category: 'TASK_POOL', order: 60, question: '积分能直接兑换现金吗？',
    answer: '不能直接兑换。积分是绩效评估与激励分配的参考依据之一，最终形式可以是：现金奖励、专项奖金、项目分成、实物、培训资源、晋升/调薪优先权（手册 § 2.5.5）。\n\n具体发放方式由公司根据经营状况和项目结果决定。' },
  { category: 'TASK_POOL', order: 70, question: '我可以自己发布任务吗？',
    answer: '原则上只有管理员可以发布。如果你觉得某件事应该进任务池，可以把想法写给你的直属上级或 HR 评估。\n\n未经批准的"个人承诺"不构成任务池奖励依据（手册 § 2.5.4：原则上单纯口头沟通不构成任务池奖励依据）。' },

  // COMP
  { category: 'COMP', order: 10, question: '工资是怎么构成的？',
    answer: '手册 § 2.4.1：整体收入 = 基础服务费 + 绩效工资 / 项目奖金 + 年度奖励 + 特别激励。\n\n简化为三层：\n• L1 基础服务费：覆盖岗位本职（手册 § 2.4.2）\n• L2 年度奖金：与绩效挂钩，可分期发放（手册 § 7.5.4）\n• L3 任务池 / 特别激励：份外贡献的浮动奖励（手册 § 2.5 / § 7.6.6）' },
  { category: 'COMP', order: 20, question: '绩效考核怎么影响我的工资？',
    answer: '手册 § 7.2.2：A 档系数 1.2 / B 档 1.0 / C 档 0.8 / D 档 0.6 / E 档 0。\n\n• 连续半年 A 档，工资可上调（§ 7.3.2）\n• 连续 3 次 C 档，工资下浮 30% 或淘汰（§ 7.3.3）\n• 整年度未达 A 档，当年不享有年终奖（§ 7.3.4）' },
  { category: 'COMP', order: 30, question: '年终奖是一次性发还是分期？',
    answer: '手册 § 7.5.4 授权公司"可采用部分延期或分期支付"。\n\n目的：让优秀员工"拿完就走"的套利不成立。具体比例以当年正式发布的奖金方案为准；公司也可根据留任安排调整发放时间与结构。' },
  { category: 'COMP', order: 40, question: '任务池积分会换成多少钱？',
    answer: '积分本身不是"定价"，而是"证据"——证明你在本职之外持续创造了额外价值。\n\n年度积分会作为评定年度奖金乘数、晋升优先权、培训资源分配的重要依据之一。总额上会有公司层面的封顶（不抢占 L1/L2 的基本盘）。' },
  { category: 'COMP', order: 50, question: '我学完新技能后想跳槽要更高工资，公司怎么处理？',
    answer: '手册 § 3.5.5 / § 3.5.7 明确禁止"以离职威胁、拒绝交接等方式施压索取不当利益""以期待薪酬调整为理由拖延工作"。\n\n公司对这类要挟式谈判一律不响应。正常调薪走固定考核窗口（§ 7.3）；学会的能力公司也希望能持续发挥，但不以牺牲规则为代价。' },

  // PROCESS
  { category: 'PROCESS', order: 10, question: '每天几点前要到岗？',
    answer: '手册 § 3.3.1：核心协同时段 09:00-12:00 / 13:30-18:00，须保持在线并及时响应。\n\n§ 3.3.2：每日 09:00 晨会视为线上签到，任务看板更新与提交记录作为工作产出主要体现。' },
  { category: 'PROCESS', order: 20, question: '如何请事假？',
    answer: '手册 § 4.1.3：\n• 至少提前 3 个工作日在 Lark 提交申请\n• 经直属主管、HR、甲方负责人批准后生效\n• 突发情况需 24 小时内补交申请，否则视为旷工\n• 事假期间不计发服务费\n• 全年累计超 15 个工作日，公司有权启动能力评估' },
  { category: 'PROCESS', order: 30, question: '合同 / 离职前要交接什么？',
    answer: '手册 § 10.3：需全面交接工作内容、文档、代码与数据、账号与权限、客户 / 团队沟通记录，以公司确认为准。\n\n禁止拖延交接、删改或隐匿文档、拒绝配合培训接任人员（§ 10.3.2）——这些行为会被依法追究违约责任。' },

  // OTHER
  { category: 'OTHER', order: 10, question: '手册最新版本在哪里看？',
    answer: '以公司最新发布的书面版本为准。任何更新至少提前一周以书面形式通知（§ 11.2）。\n\n如手册条款与合同条款存在冲突，以主合同约定为准（§ 11.1）。' },
];

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim()).filter(Boolean);

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', active: true },
      create: { email, role: 'ADMIN', active: true },
    });
    console.log(`Seeded admin: ${email}`);
  }

  // Seed positions (upsert by title)
  for (const p of POSITIONS) {
    const existing = await prisma.position.findFirst({ where: { title: p.title } });
    if (existing) {
      await prisma.position.update({
        where: { id: existing.id },
        data: p,
      });
    } else {
      await prisma.position.create({ data: p });
    }
  }
  console.log(`Seeded ${POSITIONS.length} positions`);

  // Seed FAQs (upsert by question)
  for (const f of FAQS) {
    const existing = await prisma.fAQ.findFirst({ where: { question: f.question } });
    if (existing) {
      await prisma.fAQ.update({ where: { id: existing.id }, data: f });
    } else {
      await prisma.fAQ.create({ data: f });
    }
  }
  console.log(`Seeded ${FAQS.length} FAQs`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
