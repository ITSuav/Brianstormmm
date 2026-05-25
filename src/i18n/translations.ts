import type { DroneStatus, RoutePlanningStatus } from '../domain/models'

export type Locale = 'en' | 'zhHans' | 'zhHant'

export interface LocaleOption {
  readonly id: Locale
  readonly shortLabel: string
  readonly label: string
}

interface MetricCopy {
  readonly label: string
  readonly value: string
  readonly trend: string
}

interface TimelineCopy {
  readonly label: string
}

interface AppCopy {
  readonly htmlLang: string
  readonly brand: string
  readonly title: string
  readonly nav: {
    readonly terrain: string
    readonly assets: string
    readonly interfaces: string
  }
  readonly languageSwitcherLabel: string
  readonly sections: {
    readonly operations: string
    readonly fleet: string
    readonly viewport: string
    readonly route: string
    readonly metrics: string
    readonly assets: string
    readonly timeline: string
  }
  readonly viewport: {
    readonly title: string
    readonly live: string
    readonly alt: string
    readonly badge: string
    readonly resetView: string
    readonly airspaceLabel: string
    readonly airspaceValue: string
    readonly zoneLabel: string
    readonly zoneValue: string
    readonly viewLabel: string
    readonly viewValue: string
  }
  readonly route: {
    readonly panelTitle: string
    readonly name: string
    readonly description: string
    readonly upload: string
    readonly uploadAria: string
    readonly metricsAria: string
    readonly distanceUnit: string
    readonly minutesUnit: string
    readonly riskUnit: string
    readonly waypointUnit: string
  }
  readonly interfaces: {
    readonly matsim: string
    readonly matsimValue: string
    readonly telemetry: string
    readonly telemetryValue: string
    readonly mapStack: string
    readonly mapStackValue: string
  }
  readonly data: {
    readonly operationTools: string
    readonly partnerInterfaces: string
  }
  readonly actions: {
    readonly newOrder: string
    readonly dispatchFleet: string
    readonly importRoute: string
    readonly clearance: string
    readonly kitchenWindow: string
    readonly returnHome: string
  }
  readonly collaboration: {
    readonly routeAlgorithm: string
    readonly routeAlgorithmValue: string
    readonly trafficSimulation: string
    readonly trafficSimulationValue: string
    readonly restaurantOps: string
    readonly restaurantOpsValue: string
    readonly operationsApi: string
    readonly operationsApiValue: string
  }
  readonly droneStatus: Readonly<Record<DroneStatus, string>>
  readonly routeStatus: Readonly<Record<RoutePlanningStatus, string>>
  readonly droneLocations: Readonly<Record<string, string>>
  readonly metrics: readonly MetricCopy[]
  readonly timeline: readonly TimelineCopy[]
}

export const localeOptions: readonly LocaleOption[] = [
  { id: 'en', shortLabel: 'EN', label: 'English' },
  { id: 'zhHans', shortLabel: '简', label: '中文简体' },
  { id: 'zhHant', shortLabel: '繁', label: '中文繁體' },
] as const

export const translations: Readonly<Record<Locale, AppCopy>> = {
  en: {
    htmlLang: 'en',
    brand: 'HKSTP Drone Delivery',
    title: 'Operations Control',
    nav: { terrain: 'Live Twin', assets: 'Tools', interfaces: 'Interfaces' },
    languageSwitcherLabel: 'Language',
    sections: {
      operations: 'Drone delivery operations dashboard',
      fleet: 'Fleet readiness',
      viewport: 'Interactive delivery terrain',
      route: 'Route candidate and backend handoff',
      metrics: 'Operations summary',
      assets: 'Operations tools and partner interfaces',
      timeline: 'Delivery workflow',
    },
    viewport: {
      title: 'Mountain route command view',
      live: 'Operations live',
      alt: 'Interactive Hong Kong mountain delivery digital twin for drone food delivery operations.',
      badge: 'Interactive route terrain',
      resetView: 'Reset digital twin view',
      airspaceLabel: 'Airspace',
      airspaceValue: 'Clear',
      zoneLabel: 'Service zone',
      zoneValue: 'Eastern hills',
      viewLabel: 'View control',
      viewValue: 'Interactive',
    },
    route: {
      panelTitle: 'Route intake',
      name: 'HKSTP to Ting Kok lunch route',
      description: 'Candidate route from Hong Kong Science Park to Ting Kok Village using the algorithm GeoJSON handoff. Operators review launch, relay, delivery, and return status from this screen.',
      upload: 'Review route package',
      uploadAria: 'Review route package from planning team',
      metricsAria: 'Route metrics',
      distanceUnit: 'km',
      minutesUnit: 'min',
      riskUnit: 'risk',
      waypointUnit: 'nodes',
    },
    interfaces: {
      matsim: 'Traffic simulation',
      matsimValue: 'MATSim pending',
      telemetry: 'Fleet telemetry',
      telemetryValue: 'API contract pending',
      mapStack: 'Backend service',
      mapStackValue: 'joint test pending',
    },
    data: { operationTools: 'Operations tools', partnerInterfaces: 'Partner interfaces' },
    actions: {
      newOrder: 'New delivery order',
      dispatchFleet: 'Dispatch fleet',
      importRoute: 'Import route',
      clearance: 'Airspace check',
      kitchenWindow: 'Kitchen window',
      returnHome: 'Return to base',
    },
    collaboration: {
      routeAlgorithm: 'Route planning team',
      routeAlgorithmValue: 'GeoJSON connected',
      trafficSimulation: 'Traffic simulation team',
      trafficSimulationValue: 'MATSim pending',
      restaurantOps: 'Restaurant operations',
      restaurantOpsValue: 'order window ready',
      operationsApi: 'Control room API',
      operationsApiValue: 'backend joint test pending',
    },
    droneStatus: { ready: 'ready', in_flight: 'in flight', charging: 'charging', maintenance: 'maintenance' },
    routeStatus: { algorithm_pending: 'route pending', candidate: 'candidate', approved: 'approved', active: 'active' },
    droneLocations: {
      'uav-01': 'HKSTP launch deck',
      'uav-02': 'Tai Po relay pad',
      'uav-03': 'Hangar bay',
    },
    metrics: [
      { label: 'Lunch orders', value: '36', trend: 'next 2 hours' },
      { label: 'Ready fleet', value: '2/3', trend: 'one charging' },
      { label: 'On-time target', value: '98%', trend: 'service SLA' },
      { label: 'Partner slots', value: '2', trend: 'backend + MATSim' },
    ],
    timeline: [
      { label: 'Algorithm GeoJSON connected' },
      { label: 'Route terrain refreshed' },
      { label: 'Backend API joint test' },
      { label: 'MATSim interface pending' },
    ],
  },
  zhHans: {
    htmlLang: 'zh-Hans',
    brand: '香港科学园无人机送餐',
    title: '运营总控',
    nav: { terrain: '实景孪生', assets: '功能', interfaces: '协作' },
    languageSwitcherLabel: '语言切换',
    sections: {
      operations: '无人机送餐运营总控大屏',
      fleet: '机队待命',
      viewport: '交互式配送地形',
      route: '候选路线与后端联调',
      metrics: '运营摘要',
      assets: '运营功能与协作接口',
      timeline: '配送流程',
    },
    viewport: {
      title: '山地配送指挥视图',
      live: '运营在线',
      alt: '用于无人机送餐运营的香港山地配送交互式数字孪生。',
      badge: '交互式路线地形',
      resetView: '重置数字孪生视角',
      airspaceLabel: '空域',
      airspaceValue: '可用',
      zoneLabel: '服务区',
      zoneValue: '东部山地',
      viewLabel: '视图控制',
      viewValue: '可交互',
    },
    route: {
      panelTitle: '路线导入',
      name: '香港科学园至汀角村午餐配送',
      description: '根据算法组 GeoJSON 交付生成的候选路线，运营员在此查看起飞、中继、送达与返航状态。',
      upload: '查看路线包',
      uploadAria: '查看路线规划团队提供的路线包',
      metricsAria: '路线指标',
      distanceUnit: '公里',
      minutesUnit: '分钟',
      riskUnit: '风险',
      waypointUnit: '节点',
    },
    interfaces: {
      matsim: '交通仿真',
      matsimValue: '等待 MATSim',
      telemetry: '机队遥测',
      telemetryValue: '接口待联调',
      mapStack: '后端服务',
      mapStackValue: '待联调',
    },
    data: { operationTools: '运营功能', partnerInterfaces: '协作接口' },
    actions: {
      newOrder: '新建配送单',
      dispatchFleet: '调度机队',
      importRoute: '导入路线',
      clearance: '空域检查',
      kitchenWindow: '出餐窗口',
      returnHome: '一键返航',
    },
    collaboration: {
      routeAlgorithm: '路线规划团队',
      routeAlgorithmValue: 'GeoJSON 已接入',
      trafficSimulation: '交通仿真团队',
      trafficSimulationValue: '等待 MATSim',
      restaurantOps: '餐厅运营',
      restaurantOpsValue: '出餐窗口就绪',
      operationsApi: '总控接口',
      operationsApiValue: '后端待联调',
    },
    droneStatus: { ready: '待命', in_flight: '飞行中', charging: '充电中', maintenance: '维护中' },
    routeStatus: { algorithm_pending: '路线待导入', candidate: '候选', approved: '已批准', active: '执行中' },
    droneLocations: {
      'uav-01': '香港科学园起飞平台',
      'uav-02': '大埔中继停机坪',
      'uav-03': '机库维护位',
    },
    metrics: [
      { label: '午餐订单', value: '36', trend: '未来 2 小时' },
      { label: '待命机队', value: '2/3', trend: '1 架充电中' },
      { label: '准点目标', value: '98%', trend: '服务承诺' },
      { label: '协作槽位', value: '2', trend: '后端 + MATSim' },
    ],
    timeline: [
      { label: '算法 GeoJSON 已接入' },
      { label: '路线地形已刷新' },
      { label: '后端接口联调' },
      { label: '等待 MATSim 接入' },
    ],
  },
  zhHant: {
    htmlLang: 'zh-Hant',
    brand: '香港科學園無人機送餐',
    title: '營運總控',
    nav: { terrain: '實景孿生', assets: '功能', interfaces: '協作' },
    languageSwitcherLabel: '語言切換',
    sections: {
      operations: '無人機送餐營運總控大屏',
      fleet: '機隊待命',
      viewport: '互動式配送地形',
      route: '候選路線與後端聯調',
      metrics: '營運摘要',
      assets: '營運功能與協作介面',
      timeline: '配送流程',
    },
    viewport: {
      title: '山地配送指揮視圖',
      live: '營運在線',
      alt: '用於無人機送餐營運的香港山地配送互動式數位孿生。',
      badge: '互動式路線地形',
      resetView: '重置數位孿生視角',
      airspaceLabel: '空域',
      airspaceValue: '可用',
      zoneLabel: '服務區',
      zoneValue: '東部山地',
      viewLabel: '視圖控制',
      viewValue: '可互動',
    },
    route: {
      panelTitle: '路線匯入',
      name: '香港科學園至汀角村午餐配送',
      description: '根據演算法組 GeoJSON 交付生成的候選路線，營運員在此查看起飛、中繼、送達與返航狀態。',
      upload: '查看路線包',
      uploadAria: '查看路線規劃團隊提供的路線包',
      metricsAria: '路線指標',
      distanceUnit: '公里',
      minutesUnit: '分鐘',
      riskUnit: '風險',
      waypointUnit: '節點',
    },
    interfaces: {
      matsim: '交通模擬',
      matsimValue: '等待 MATSim',
      telemetry: '機隊遙測',
      telemetryValue: '介面待聯調',
      mapStack: '後端服務',
      mapStackValue: '待聯調',
    },
    data: { operationTools: '營運功能', partnerInterfaces: '協作介面' },
    actions: {
      newOrder: '新增配送單',
      dispatchFleet: '調度機隊',
      importRoute: '匯入路線',
      clearance: '空域檢查',
      kitchenWindow: '出餐窗口',
      returnHome: '一鍵返航',
    },
    collaboration: {
      routeAlgorithm: '路線規劃團隊',
      routeAlgorithmValue: 'GeoJSON 已接入',
      trafficSimulation: '交通模擬團隊',
      trafficSimulationValue: '等待 MATSim',
      restaurantOps: '餐廳營運',
      restaurantOpsValue: '出餐窗口就緒',
      operationsApi: '總控介面',
      operationsApiValue: '後端待聯調',
    },
    droneStatus: { ready: '待命', in_flight: '飛行中', charging: '充電中', maintenance: '維護中' },
    routeStatus: { algorithm_pending: '路線待匯入', candidate: '候選', approved: '已批准', active: '執行中' },
    droneLocations: {
      'uav-01': '香港科學園起飛平台',
      'uav-02': '大埔中繼停機坪',
      'uav-03': '機庫維護位',
    },
    metrics: [
      { label: '午餐訂單', value: '36', trend: '未來 2 小時' },
      { label: '待命機隊', value: '2/3', trend: '1 架充電中' },
      { label: '準點目標', value: '98%', trend: '服務承諾' },
      { label: '協作槽位', value: '2', trend: '後端 + MATSim' },
    ],
    timeline: [
      { label: '演算法 GeoJSON 已接入' },
      { label: '路線地形已刷新' },
      { label: '後端介面聯調' },
      { label: '等待 MATSim 接入' },
    ],
  },
} as const
