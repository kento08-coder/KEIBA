import {
  ChartNoAxesCombined,
  FlagTriangleRight,
  Home,
  Settings,
  TicketCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavigationItem {
  icon: LucideIcon
  label: string
  path: string
  primary: boolean
}

export const navigationItems: NavigationItem[] = [
  { icon: Home, label: 'ホーム', path: '/', primary: true },
  { icon: FlagTriangleRight, label: 'レース', path: '/races', primary: true },
  { icon: TicketCheck, label: '購入', path: '/purchases', primary: true },
  {
    icon: ChartNoAxesCombined,
    label: '分析',
    path: '/analytics',
    primary: true,
  },
  { icon: Settings, label: '設定', path: '/settings', primary: false },
]
