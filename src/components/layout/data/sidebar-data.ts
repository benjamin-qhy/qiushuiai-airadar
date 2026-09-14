import {
  Activity,
  Command,
  LibraryBig,
  Rss,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: '秋水',
    email: '单用户私有部署',
    avatar: '',
  },
  teams: [
    {
      name: 'AI Radar',
      logo: Command,
      plan: '个人内容雷达',
    },
  ],
  navGroups: [
    {
      title: '内容',
      items: [
        { title: '每日精选', url: '/', icon: Sparkles },
        { title: '全部内容', url: '/contents', icon: LibraryBig },
      ],
    },
    {
      title: '采集',
      items: [
        { title: '信源', url: '/sources', icon: Rss },
        { title: '运行状态', url: '/operations', badge: '3', icon: Activity },
      ],
    },
    {
      title: '系统',
      items: [
        { title: '配置中心', url: '/configuration', icon: Settings2 },
      ],
    },
  ],
}
