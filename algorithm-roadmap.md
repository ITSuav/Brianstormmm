# 长者紧急无人机配送算法路线

## 1. 项目算法定位

**面向香港长者紧急物资配送的无人机路径规划系统。**

核心卖点不是单纯计算最短路，而是：

1. 将长者紧急程度量化。
2. 根据紧急程度、电量、禁飞区、风险和充电桩动态规划路线。
3. 在低电量、临时限制区、山地区域等异常场景下自动重规划。

建议算法名称：

**Emergency-Aware Energy-Risk Adaptive Routing，E3AR**

中文名称：

**面向长者紧急配送的能耗-风险自适应路径规划算法**

## 2. 算法总流程

```text
健康数据 / 求助信号
    ↓
紧急度评分
    ↓
任务优先级排序
    ↓
构建可飞行图
    ↓
禁飞区过滤
    ↓
自适应权重 A*
    ↓
低电量异常检测
    ↓
HNSW 充电桩候选搜索
    ↓
充电绕行路径重规划
    ↓
输出路线和指标
```

## 3. 紧急度评分

长者紧急度可以由健康检测仪、健康手环、主动求助信号和等待时间共同决定。

示例评分：

```text
urgency_score =
    健康异常程度
  + 异常指标数量
  + 主动求助权重
  + 年龄 / 独居权重
  + 等待时间权重
```

建议分级：

| 等级 | 含义 | 路径偏好 |
| --- | --- | --- |
| Level 1 | 普通配送 | 省电优先 |
| Level 2 | 轻度异常 | 省电 + 低风险 |
| Level 3 | 中度紧急 | 时间、能耗、风险均衡 |
| Level 4 | 严重紧急 | 时间优先 |
| Level 5 | 生命风险 | 最短时间优先，但仍不能穿越禁飞区 |

## 4. 飞行图建模

不要直接在连续地图空间中搜索。比赛原型阶段建议先离散成图。

节点包括：

- 配送站点
- 长者目的地
- 充电桩
- 中转点
- 安全航路点
- 禁飞区边界绕行点
- 山区 / 市区关键 waypoint

边表示两个节点之间可飞行。每条边需要计算：

```text
distance
estimated_time
energy_cost
risk_score
crosses_no_fly_zone
terrain_penalty
weather_penalty
```

如果边穿过禁飞区，直接删除或标记为不可用。

## 5. 路径代价函数

将“最短时间、最低能耗、最低风险”统一成一个可调权重函数：

```text
cost = α * time + β * energy + γ * risk + δ * terrain_penalty + ε * weather_penalty
```

不同任务使用不同权重：

```text
高紧急任务：α 增大，优先最短时间
低电量任务：β 增大，优先省电或靠近充电桩
高风险区域：γ 增大，优先安全
山区任务：δ 和 ε 增大
```

这样可以把算法描述为：

**自适应多目标路径规划。**

## 6. 正常任务路径规划

当任务目的地已知时：

1. 基础版本使用 Dijkstra。
2. 优化版本使用 A*。
3. 展示版本推荐 A*，因为可以使用直线距离或预计飞行时间作为启发函数。

输出结果：

```text
best_path
total_distance
estimated_time
estimated_energy
risk_score
reasoning
```

## 7. 低电量异常处理

低电量时，不应该只找最近充电桩，而应该找“综合最优充电桩”。

流程：

```text
当前电量不足
    ↓
HNSW 搜索 Top-K 候选充电桩
    ↓
过滤当前电量不可达的充电桩
    ↓
根据距离、风险、排队时间、可用性综合排序
    ↓
A* 规划到最优充电桩
    ↓
充电后重新规划到原目的地
```

候选充电桩评分：

```text
station_score =
    distance_cost
  + queue_time
  + risk_cost
  + charging_availability_penalty
  - urgency_bonus
```

## 8. 开发步骤

### 第一步：定义算法输入输出

任务输入：

```python
Task = {
    "task_id": "T001",
    "start": [lon, lat],
    "destination": [lon, lat],
    "payload_weight": 1.5,
    "urgency_level": 4,
    "deadline_minutes": 20
}
```

无人机输入：

```python
Drone = {
    "drone_id": "D001",
    "current_location": [lon, lat],
    "battery": 0.42,
    "max_range_km": 18,
    "payload_capacity": 3
}
```

### 第二步：准备最小数据集

先准备 demo 级别数据：

- 5-10 个配送站
- 20-50 个长者目的地
- 5-10 个充电桩
- 50-200 个 waypoint
- 若干模拟风险区
- 若干无人机状态

不要一开始追求全香港完整数据，先让算法链路跑通。

### 第三步：构建 Graph

将 waypoint、站点、充电桩、目的地作为节点。两两连接时判断：

- 是否距离太远
- 是否穿过禁飞区
- 是否超过无人机单段续航
- 是否穿过高风险区域

合格连接才加入图。

### 第四步：实现基础路径规划

先做三个版本：

1. 最短时间路径
2. 最低能耗路径
3. 最低风险路径

再合并成统一加权 cost function。

### 第五步：实现紧急度权重切换

示例：

```text
Level 1-2：省电优先
Level 3：时间和风险均衡
Level 4-5：时间优先，但不能穿越禁飞区
```

这是算法部分和长者紧急度痛点绑定的关键。

### 第六步：实现低电量异常处理

```text
当前电量不足
-> HNSW 搜索 Top-K 充电桩
-> 过滤电量不可达的充电桩
-> 对候选充电桩排序
-> A* 规划到最优充电桩
-> 充电后重新规划原任务
```

### 第七步：输出展示指标

前端和答辩建议展示：

```text
总距离
预计时间
预计能耗
剩余电量
风险评分
绕开禁飞区数量
是否需要充电
选择该路径的原因
```

### 第八步：做对比实验

建议做三组对比：

1. 普通 Dijkstra vs 加权 A*
2. 最近充电桩 vs HNSW + 综合评分充电桩
3. 无紧急度调度 vs 长者紧急度优先调度

## 9. 当前原型文件

当前目录下已经有一个小型 Python 原型：

- `route_planning_prototype.py`
- `test_route_planning_prototype.py`

原型覆盖：

- 可飞行图构建
- 禁飞区相交过滤
- 紧急度权重
- A* 路径规划
- 低电量时先去充电桩
- 充电后继续规划到目的地

运行测试：

```bash
python3 -m unittest test_route_planning_prototype.py -v
```

运行演示：

```bash
python3 route_planning_prototype.py
```

说明：当前原型中的 `ChargingStationIndex` 保留了 HNSW 风格接口，但为了不依赖额外第三方库，内部先使用线性最近邻搜索。后续接入 `hnswlib` 或 `FAISS` 时，只需要替换这个类的内部实现。
