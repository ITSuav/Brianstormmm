import unittest

from route_planning_prototype import (
    ChargingStationIndex,
    Drone,
    Node,
    NoFlyZone,
    Task,
    build_flight_graph,
    plan_mission,
)


class RoutePlanningPrototypeTest(unittest.TestCase):
    def setUp(self):
        self.nodes = [
            Node("depot", 0.0, 0.0, "depot"),
            Node("north", 0.0, 2.0, "waypoint"),
            Node("south", 0.0, -2.0, "waypoint"),
            Node("destination", 4.0, 0.0, "destination"),
            Node("charger_near", 0.0, 1.0, "charger"),
            Node("charger_far", 3.5, 2.0, "charger"),
        ]
        self.no_fly_zones = [
            NoFlyZone("central_rfz", [(1.0, -0.5), (3.0, -0.5), (3.0, 0.5), (1.0, 0.5)])
        ]

    def test_normal_task_routes_around_no_fly_zone(self):
        graph = build_flight_graph(self.nodes, self.no_fly_zones, max_edge_distance=5.0)
        task = Task("T001", "depot", "destination", urgency_level=5, payload_weight_kg=1.0)
        drone = Drone("D001", "depot", battery_percent=90.0, energy_capacity=100.0)

        plan = plan_mission(graph, task, drone, ChargingStationIndex(self.nodes))

        self.assertEqual(plan.status, "direct")
        self.assertEqual(plan.path[0], "depot")
        self.assertEqual(plan.path[-1], "destination")
        self.assertNotEqual(plan.path, ["depot", "destination"])
        self.assertGreater(plan.metrics["risk"], 0.0)

    def test_low_battery_routes_to_reachable_charger_first(self):
        graph = build_flight_graph(self.nodes, self.no_fly_zones, max_edge_distance=5.0)
        task = Task("T002", "depot", "destination", urgency_level=3, payload_weight_kg=1.0)
        drone = Drone("D002", "depot", battery_percent=15.0, energy_capacity=100.0)

        plan = plan_mission(graph, task, drone, ChargingStationIndex(self.nodes))

        self.assertEqual(plan.status, "charge_required")
        self.assertEqual(plan.charging_station, "charger_near")
        self.assertEqual(plan.path[0], "depot")
        self.assertEqual(plan.path[-1], "destination")
        self.assertIn("charger_near", plan.path)


if __name__ == "__main__":
    unittest.main()
