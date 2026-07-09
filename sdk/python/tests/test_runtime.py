import json
import unittest
from unittest import mock

from robolocks import runtime


def _observation(tick: int) -> str:
    return json.dumps({
        "tick": tick,
        "selfId": 1,
        "self": {
            "unitId": 1,
            "position": {"x": 0.0, "y": 0.0},
            "hullHeadingDegrees": 0.0,
            "turretHeadingDegrees": 0.0,
            "armorIntegrity": 100.0,
        },
        "contacts": {},
    })


def _start_payload() -> str:
    return json.dumps({"type": "start", "spec": {
        "unitId": 1, "name": "b", "teamId": 1,
        "transform": {"position": {"x": 0.0, "y": 0.0}, "hullHeadingDegrees": 0.0},
        "modules": {},
    }})


class RegisteredBotTest(unittest.TestCase):
    def tearDown(self):
        runtime.clear_registered_bot()

    def test_run_bot_registers_in_browser_runtime(self):
        seen = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: seen.append(state.tick) or [])
        response = json.loads(runtime.call_registered_bot(_observation(7)))
        self.assertEqual(response, {"orders": []})
        self.assertEqual(seen, [7])

    def test_start_payload_invokes_on_start_and_returns_no_orders(self):
        specs = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: [], on_start=specs.append)
        self.assertEqual(json.loads(runtime.call_registered_bot(_start_payload())), {"orders": []})
        self.assertEqual(len(specs), 1)

    def test_call_without_registration_raises(self):
        with self.assertRaises(RuntimeError):
            runtime.call_registered_bot(_observation(1))

    def test_clear_fires_on_end(self):
        ended = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: [], on_end=ended.append)
        runtime.clear_registered_bot()
        self.assertEqual(ended, [None])


if __name__ == "__main__":
    unittest.main()
