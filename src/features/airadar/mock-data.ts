export type ContentItem = {
  id: string
  title: string
  summary: string
  source: string
  author: string
  kind: '短文' | '视频' | '图文' | '文章'
  level: '核心精选' | '探索候选' | '不入流'
  status: '已完成' | '补全失败' | '等待转写' | '处理中' | '原文不可用'
  score: number
  time: string
  engagement: string
  tags: string[]
  body: string
  scores: { label: string; value: number }[]
  junk?: { source: 'AI' | '人工'; reason: string }
}

const scoreLabels = [
  '主题匹配',
  '实质性',
  '可信度',
  '新颖性',
  '可操作性',
  '工作价值',
  '清晰完整',
]

const scoreItems = (values: number[]) =>
  scoreLabels.map((label, index) => ({ label, value: values[index] ?? 0 }))

export const contentItems: ContentItem[] = [
  {
    id: 'radar-001',
    title: '从 Agent Loop 到可靠工作流：为什么确定性边界更重要',
    summary:
      '作者拆解智能体在真实业务中的失控点，并给出“模型负责判断、代码负责状态与副作用”的落地方法。',
    source: 'X',
    author: 'Lina Chen',
    kind: '短文',
    level: '核心精选',
    status: '已完成',
    score: 93,
    time: '今天 08:12',
    engagement: '1.8k 赞 · 326 转发 · 94 评论',
    tags: ['AI 智能体', '工程实践'],
    body:
      '真正可靠的 Agent 系统不会把所有事情都交给模型。模型适合判断含义、归纳和生成建议；任务状态、重试、权限与外部副作用应该由可测试的代码控制。文章随后给出了失败重试、状态审计和人工接管的具体边界。',
    scores: scoreItems([5, 5, 4, 4, 5, 5, 4]),
  },
  {
    id: 'radar-002',
    title: 'Mem0 深度解析：个人 AI 记忆系统如何组织长期上下文',
    summary:
      '用三个层次解释记忆抽取、冲突合并和按需召回，包含可以直接用于个人知识库的结构建议。',
    source: 'YouTube',
    author: 'AI Engineer',
    kind: '视频',
    level: '核心精选',
    status: '已完成',
    score: 88,
    time: '今天 07:40',
    engagement: '42k 播放 · 2.7k 赞 · 186 评论',
    tags: ['AI 记忆', '知识库'],
    body:
      '视频从记忆写入、记忆整理和检索使用三个环节解释长期记忆系统，并比较向量召回与结构化个人事实的差异。字幕已完整获取，可直接阅读。',
    scores: scoreItems([5, 4, 4, 4, 4, 5, 4]),
  },
  {
    id: 'radar-003',
    title: '一个人维护 30 个信源：低成本内容雷达的完整工作流',
    summary:
      '从 RSS、社交平台和视频源统一发现内容，再通过分层处理降低模型调用量。',
    source: 'RSS',
    author: 'Product Builder Weekly',
    kind: '文章',
    level: '探索候选',
    status: '已完成',
    score: 74,
    time: '昨天 22:16',
    engagement: '阅读量 8.4k',
    tags: ['内容工作流', '产品增长'],
    body:
      '文章强调先用确定性规则完成去重和完整性检查，再把真正需要语义判断的内容交给模型，以此减少重复调用。',
    scores: scoreItems([4, 4, 4, 3, 4, 4, 4]),
  },
  {
    id: 'radar-004',
    title: '企业 RAG 评估清单：上线前必须回答的 12 个问题',
    summary:
      '一组图文总结数据权限、召回率、答案引用、更新延迟和人工兜底。',
    source: '小红书',
    author: '知识库产品手记',
    kind: '图文',
    level: '探索候选',
    status: '已完成',
    score: 69,
    time: '昨天 20:34',
    engagement: '3.1k 赞 · 980 收藏 · 47 评论',
    tags: ['RAG', '企业落地'],
    body:
      '图文卡片覆盖企业知识库上线前的关键检查项，适合作为项目方案评审时的备忘清单。',
    scores: scoreItems([4, 4, 3, 3, 4, 4, 4]),
  },
  {
    id: 'radar-005',
    title: 'AI 写作工具限时优惠，注册送 10000 积分',
    summary: '主要内容为产品促销和邀请码，没有可复用的方法或事实。',
    source: '抖音',
    author: 'AI 效率神器',
    kind: '视频',
    level: '不入流',
    status: '已完成',
    score: 26,
    time: '昨天 18:02',
    engagement: '12k 播放 · 630 赞 · 16 评论',
    tags: ['AI 应用'],
    body: '视频内容以促销口播为主，引导用户注册并填写邀请码。',
    scores: scoreItems([2, 1, 2, 1, 1, 1, 3]),
    junk: { source: 'AI', reason: '广告营销' },
  },
  {
    id: 'radar-006',
    title: 'Pi Agent Skill 编排实践：把重复提示词变成可维护能力',
    summary: '来源正文接口连续失败，当前不能进入分析和每日精选。',
    source: '视频号',
    author: 'Agent 实验室',
    kind: '视频',
    level: '不入流',
    status: '补全失败',
    score: 0,
    time: '今天 06:55',
    engagement: '互动数据暂缺',
    tags: ['Pi Agent', 'Skill'],
    body: '正文尚未补全。',
    scores: scoreItems([]),
  },
  {
    id: 'radar-007',
    title: '开源 AI 项目本周趋势合集',
    summary: '视频没有平台字幕，等待手工决定是否启动语音转写。',
    source: 'YouTube',
    author: 'Open Source AI',
    kind: '视频',
    level: '不入流',
    status: '等待转写',
    score: 0,
    time: '今天 06:21',
    engagement: '6.2k 播放 · 421 赞 · 23 评论',
    tags: ['开源 GitHub 项目'],
    body: '尚无字幕，未进入内容分析。',
    scores: scoreItems([]),
  },
]

export const sourceItems = [
  { platform: 'X', name: 'AI Builders List', target: '@ai_builders', status: '正常', last: '8 分钟前', count: 18, provider: 'X 主线路' },
  { platform: 'YouTube', name: 'AI Engineer', target: '@ai-engineer', status: '正常', last: '16 分钟前', count: 2, provider: 'YouTube API' },
  { platform: 'RSS', name: 'Product Builder Weekly', target: 'productbuilder.news/feed', status: '正常', last: '22 分钟前', count: 5, provider: '内置 RSS' },
  { platform: '抖音', name: 'AI 产品观察', target: 'douyin: 998821', status: '已切换供应商', last: '31 分钟前', count: 7, provider: '备用线路 2' },
  { platform: '视频号', name: 'Agent 实验室', target: 'wxchannel: agent-lab', status: '部分失败', last: '44 分钟前', count: 3, provider: '主线路' },
  { platform: '小红书', name: '知识库产品手记', target: 'rednote: rag-notes', status: '正常', last: '52 分钟前', count: 9, provider: '采集线路 1' },
]
