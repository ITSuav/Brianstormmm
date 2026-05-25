from __future__ import annotations

from dataclasses import dataclass
import heapq
import math
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


Point = Tuple[float, float]


@dataclass(frozen=True)
class Node:
    node_id: str
    lon: float
    lat: float
    kind: str


@dataclass(frozen=True)
class Edge:
    to_node: str
    distance: float
    time: float
    energy: float
    risk: float


@dataclass(frozen=True)
class NoFlyZone:
    zone_id: str
    polygon: Sequence[Point]


@dataclass(frozen=True)
class Task:
    task_id: str
    start: str
    destination: str
    urgency_level: int
    payload_weight_kg: float


@dataclass(frozen=True)
class Drone:
    drone_id: str
    current_node: str
    battery_percent: float
    energy_capacity: float

    @property
    def available_energy(self) -> float:
        return self.energy_capacity * self.battery_percent / 100.0


@dataclass(frozen=True)
class RoutePlan:
    status: str
    path: List[str]
    metrics: Dict[str, float]
    charging_station: Optional[str] = None


class FlightGraph:
    def __init__(self, nodes: Iterable[Node]):
        self.nodes: Dict[str, Node] = {node.node_id: node for node in nodes}
        self.edges: Dict[str, List[Edge]] = {node_id: [] for node_id in self.nodes}

    def add_edge(self, from_node: str, edge: Edge) -> None:
        self.edges[from_node].append(edge)


class ChargingStationIndex:
    """Small HNSW-compatible interface.

    The prototype uses a deterministic linear fallback so it runs without extra
    dependencies. In production, replace the body with hnswlib/FAISS indexing.
    """

    def __init__(self, nodes: Iterable[Node]):
        self.stations = [node for node in nodes if node.kind == "charger"]

    def query(self, location: Node, top_k: int = 3) -> List[Node]:
        ranked = sorted(self.stations, key=lambda station: euclidean(location, station))
        return ranked[:top_k]


def urgency_weights(urgency_level: int) -> Dict[str, float]:
    if urgency_level >= 5:
        return {"time": 0.70, "energy": 0.10, "risk": 0.20}
    if urgency_level >= 3:
        return {"time": 0.45, "energy": 0.25, "risk": 0.30}
    return {"time": 0.25, "energy": 0.45, "risk": 0.30}


def build_flight_graph(
    nodes: Sequence[Node],
    no_fly_zones: Sequence[NoFlyZone],
    max_edge_distance: float,
) -> FlightGraph:
    graph = FlightGraph(nodes)
    for source in nodes:
        for target in nodes:
            if source.node_id == target.node_id:
                continue
            distance = euclidean(source, target)
            if distance > max_edge_distance:
                continue
            if crosses_any_no_fly_zone((source.lon, source.lat), (target.lon, target.lat), no_fly_zones):
                continue
            graph.add_edge(
                source.node_id,
                Edge(
                    to_node=target.node_id,
                    distance=distance,
                    time=distance / 0.8,
                    energy=distance * 8.0,
                    risk=distance * risk_factor(source, target),
                ),
            )
    return graph


def plan_mission(
    graph: FlightGraph,
    task: Task,
    drone: Drone,
    charging_index: ChargingStationIndex,
) -> RoutePlan:
    direct = astar(graph, task.start, task.destination, task.urgency_level)
    if direct is None:
        raise ValueError(f"No route from {task.start} to {task.destination}")

    if direct.metrics["energy"] <= drone.available_energy:
        return RoutePlan(status="direct", path=direct.path, metrics=direct.metrics)

    current = graph.nodes[task.start]
    for station in charging_index.query(current, top_k=5):
        to_charger = astar(graph, task.start, station.node_id, task.urgency_level)
        if to_charger is None or to_charger.metrics["energy"] > drone.available_energy:
            continue
        from_charger = astar(graph, station.node_id, task.destination, task.urgency_level)
        if from_charger is None:
            continue
        full_path = to_charger.path + from_charger.path[1:]
        metrics = merge_metrics(to_charger.metrics, from_charger.metrics)
        return RoutePlan(
            status="charge_required",
            path=full_path,
            metrics=metrics,
            charging_station=station.node_id,
        )

    raise ValueError("No reachable charging station found")


def astar(graph: FlightGraph, start: str, goal: str, urgency_level: int) -> Optional[RoutePlan]:
    weights = urgency_weights(urgency_level)
    queue: List[Tuple[float, str]] = [(0.0, start)]
    came_from: Dict[str, Optional[str]] = {start: None}
    best_cost: Dict[str, float] = {start: 0.0}
    edge_metrics: Dict[str, Dict[str, float]] = {
        start: {"distance": 0.0, "time": 0.0, "energy": 0.0, "risk": 0.0}
    }

    while queue:
        _, current = heapq.heappop(queue)
        if current == goal:
            path = reconstruct_path(came_from, goal)
            return RoutePlan(status="planned", path=path, metrics=edge_metrics[goal])

        for edge in graph.edges[current]:
            step_cost = weighted_cost(edge, weights)
            new_cost = best_cost[current] + step_cost
            if edge.to_node in best_cost and new_cost >= best_cost[edge.to_node]:
                continue
            came_from[edge.to_node] = current
            best_cost[edge.to_node] = new_cost
            edge_metrics[edge.to_node] = add_metrics(edge_metrics[current], edge)
            heuristic = euclidean(graph.nodes[edge.to_node], graph.nodes[goal]) * weights["time"]
            heapq.heappush(queue, (new_cost + heuristic, edge.to_node))

    return None


def weighted_cost(edge: Edge, weights: Dict[str, float]) -> float:
    return edge.time * weights["time"] + edge.energy * weights["energy"] + edge.risk * weights["risk"]


def add_metrics(metrics: Dict[str, float], edge: Edge) -> Dict[str, float]:
    return {
        "distance": metrics["distance"] + edge.distance,
        "time": metrics["time"] + edge.time,
        "energy": metrics["energy"] + edge.energy,
        "risk": metrics["risk"] + edge.risk,
    }


def merge_metrics(first: Dict[str, float], second: Dict[str, float]) -> Dict[str, float]:
    return {key: first[key] + second[key] for key in first}


def reconstruct_path(came_from: Dict[str, Optional[str]], goal: str) -> List[str]:
    path = [goal]
    current = goal
    while came_from[current] is not None:
        current = came_from[current]  # type: ignore[assignment]
        path.append(current)
    path.reverse()
    return path


def risk_factor(source: Node, target: Node) -> float:
    risk_by_kind = {"depot": 0.5, "charger": 0.4, "waypoint": 0.7, "destination": 0.8}
    return (risk_by_kind.get(source.kind, 1.0) + risk_by_kind.get(target.kind, 1.0)) / 2.0


def euclidean(source: Node, target: Node) -> float:
    return math.hypot(source.lon - target.lon, source.lat - target.lat)


def crosses_any_no_fly_zone(start: Point, end: Point, zones: Sequence[NoFlyZone]) -> bool:
    return any(segment_crosses_polygon(start, end, zone.polygon) for zone in zones)


def segment_crosses_polygon(start: Point, end: Point, polygon: Sequence[Point]) -> bool:
    if point_in_polygon(start, polygon) or point_in_polygon(end, polygon):
        return True
    closed = list(polygon) + [polygon[0]]
    for index in range(len(closed) - 1):
        if segments_intersect(start, end, closed[index], closed[index + 1]):
            return True
    return False


def point_in_polygon(point: Point, polygon: Sequence[Point]) -> bool:
    x, y = point
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersects = (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def segments_intersect(a: Point, b: Point, c: Point, d: Point) -> bool:
    def orientation(p: Point, q: Point, r: Point) -> float:
        return (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])

    def on_segment(p: Point, q: Point, r: Point) -> bool:
        return min(p[0], r[0]) <= q[0] <= max(p[0], r[0]) and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])

    o1 = orientation(a, b, c)
    o2 = orientation(a, b, d)
    o3 = orientation(c, d, a)
    o4 = orientation(c, d, b)

    if o1 * o2 < 0 and o3 * o4 < 0:
        return True
    if o1 == 0 and on_segment(a, c, b):
        return True
    if o2 == 0 and on_segment(a, d, b):
        return True
    if o3 == 0 and on_segment(c, a, d):
        return True
    if o4 == 0 and on_segment(c, b, d):
        return True
    return False


def demo() -> RoutePlan:
    nodes = [
        Node("depot", 0.0, 0.0, "depot"),
        Node("north", 0.0, 2.0, "waypoint"),
        Node("south", 0.0, -2.0, "waypoint"),
        Node("destination", 4.0, 0.0, "destination"),
        Node("charger_near", 0.0, 1.0, "charger"),
        Node("charger_far", 3.5, 2.0, "charger"),
    ]
    zones = [NoFlyZone("central_rfz", [(1.0, -0.5), (3.0, -0.5), (3.0, 0.5), (1.0, 0.5)])]
    graph = build_flight_graph(nodes, zones, max_edge_distance=5.0)
    task = Task("T-demo", "depot", "destination", urgency_level=4, payload_weight_kg=1.0)
    drone = Drone("D-demo", "depot", battery_percent=15.0, energy_capacity=100.0)
    return plan_mission(graph, task, drone, ChargingStationIndex(nodes))


if __name__ == "__main__":
    plan = demo()
    print(f"status: {plan.status}")
    print(f"path: {' -> '.join(plan.path)}")
    if plan.charging_station:
        print(f"charging_station: {plan.charging_station}")
    print("metrics:")
    for key, value in plan.metrics.items():
        print(f"  {key}: {value:.2f}")
