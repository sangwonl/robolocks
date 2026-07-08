from __future__ import annotations

import math

from robolocks import (
    AimAt,
    BattleState,
    FaceArmorToward,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    Vec2,
    distance,
    run_bot,
)


ARENA_MIN_X = 2.5
ARENA_MAX_X = 37.5
ARENA_MIN_Y = 2.5
ARENA_MAX_Y = 21.5
DESIRED_RANGE_M = 17.0


def on_start(spec) -> None:
    pass


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    if own.armor_integrity <= 0:
        return []

    enemy = state.contacts.closest_enemy()
    if enemy is None:
        return [
            MoveTo(state.map.center),
            ScanArc(center=own.hull_heading_deg, width_deg=160),
        ]

    move_target = avoid_blocking_obstacles(state, spacing_target(state, enemy.position))
    orders: list[OrderLike] = [
        FaceArmorToward(enemy.position),
        AimAt(enemy.position),
    ]

    if own.can_fire:
        orders.append(FireIfSolution(min_hit_chance=0.6))

    if own.intent.mobility.should_reissue(move_target, threshold_m=3.0, min_age_ticks=12):
        orders.append(MoveTo(move_target))

    return orders


def on_end(result) -> None:
    pass


def spacing_target(state: BattleState, enemy_position: Vec2) -> Vec2:
    own = state.own_unit.position
    dx = own.x - enemy_position.x
    dy = own.y - enemy_position.y
    range_m = math.hypot(dx, dy)
    if range_m < 0.001:
        return state.map.center

    away_x = dx / range_m
    away_y = dy / range_m
    side = 1.0 if (state.tick // 45 + state.self_id) % 2 == 0 else -1.0
    strafe_x = -away_y * side
    strafe_y = away_x * side

    if range_m < DESIRED_RANGE_M - 3.0:
        return clamp_point(own.x + away_x * 6.0 + strafe_x * 3.0, own.y + away_y * 6.0 + strafe_y * 3.0)

    if range_m > DESIRED_RANGE_M + 6.0:
        return clamp_point(own.x - away_x * 6.0 + strafe_x * 2.0, own.y - away_y * 6.0 + strafe_y * 2.0)

    return clamp_point(own.x + strafe_x * 6.0, own.y + strafe_y * 6.0)


def avoid_blocking_obstacles(state: BattleState, target: Vec2) -> Vec2:
    own = state.own_unit.position
    for obstacle in state.map.obstacles:
        if not obstacle.blocks_movement:
            continue
        clearance_m = obstacle.radius_m + 4.0
        if distance_point_to_segment(obstacle.position, own, target) > clearance_m:
            continue

        path_x = target.x - own.x
        path_y = target.y - own.y
        path_len = math.hypot(path_x, path_y)
        if path_len < 0.001:
            continue

        side = 1.0 if state.self_id == 1 else -1.0
        return clamp_point(
            obstacle.position.x + (-path_y / path_len) * clearance_m * side,
            obstacle.position.y + (path_x / path_len) * clearance_m * side,
        )

    return target


def distance_point_to_segment(point: Vec2, start: Vec2, end: Vec2) -> float:
    dx = end.x - start.x
    dy = end.y - start.y
    length_sq = dx * dx + dy * dy
    if length_sq <= 0.000001:
        return distance(point, start)

    t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / length_sq
    t = min(1.0, max(0.0, t))
    closest = Vec2(start.x + dx * t, start.y + dy * t)
    return distance(point, closest)


def clamp_point(x: float, y: float) -> Vec2:
    return Vec2(
        min(ARENA_MAX_X, max(ARENA_MIN_X, x)),
        min(ARENA_MAX_Y, max(ARENA_MIN_Y, y)),
    )


run_bot(on_tick, on_start=on_start, on_end=on_end)
