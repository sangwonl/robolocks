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

PATROLS = {
    1: [
        Vec2(9.0, 17.0),
        Vec2(15.0, 18.0),
        Vec2(21.0, 15.0),
        Vec2(17.0, 7.0),
    ],
    2: [
        Vec2(31.0, 7.0),
        Vec2(25.0, 6.0),
        Vec2(19.0, 9.0),
        Vec2(23.0, 17.0),
    ],
}

FLANKS = {
    1: [
        Vec2(12.0, 18.0),
        Vec2(20.0, 19.0),
        Vec2(27.0, 15.0),
    ],
    2: [
        Vec2(28.0, 6.0),
        Vec2(20.0, 5.0),
        Vec2(13.0, 9.0),
    ],
}


def waypoint_for_tick(points, tick, phase_ticks):
    index = (tick // phase_ticks) % len(points)
    return points[index]


def distance_point_to_segment(point, start, end):
    dx = end.x - start.x
    dy = end.y - start.y
    length_sq = dx * dx + dy * dy
    if length_sq <= 0.000001:
        return math.hypot(point.x - start.x, point.y - start.y)
    t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / length_sq
    t = min(1.0, max(0.0, t))
    closest_x = start.x + dx * t
    closest_y = start.y + dy * t
    return math.hypot(point.x - closest_x, point.y - closest_y)


def route_around_obstacles(state: BattleState, target: Vec2) -> Vec2:
    own = state.own_unit.position
    best = None
    best_distance = 0.0
    for obstacle in state.map.obstacles:
        if not obstacle.blocks_movement:
            continue
        clearance = obstacle.radius_m + 4.0
        segment_distance = distance_point_to_segment(obstacle.position, own, target)
        if segment_distance >= clearance:
            continue
        to_target_x = target.x - own.x
        to_target_y = target.y - own.y
        length_m = math.hypot(to_target_x, to_target_y)
        if length_m <= 0.000001:
            continue
        side = 1.0 if state.self_id == 1 else -1.0
        perp_x = -to_target_y / length_m * side
        perp_y = to_target_x / length_m * side
        detour = clamp_point(
            obstacle.position.x + perp_x * clearance,
            obstacle.position.y + perp_y * clearance,
        )
        detour_distance = distance(detour, own)
        if best is None or detour_distance < best_distance:
            best = detour
            best_distance = detour_distance
    return best or target


TARGET_CHANGE_THRESHOLD_M = 5.0
MIN_MOBILITY_AGE_TICKS = 20
MIN_TURRET_AGE_TICKS = 8


def target_changed(current, target, threshold_m):
    return distance(current, target) > threshold_m


def should_update_mobility(intent, move_target):
    """Only re-issue MoveTo when the intent is old enough or the target drifted."""
    if not intent.active:
        return True
    if intent.age_ticks >= MIN_MOBILITY_AGE_TICKS:
        return target_changed(intent.target, move_target, TARGET_CHANGE_THRESHOLD_M)
    return False


def should_update_turret(intent, target_pos):
    """Only re-issue AimAt when the turret intent is old enough or the target drifted."""
    if not intent.active:
        return True
    if intent.age_ticks >= MIN_TURRET_AGE_TICKS:
        return distance(intent.target, target_pos) > 0.5
    return False


def clamp_point(x, y):
    return Vec2(
        min(ARENA_MAX_X, max(ARENA_MIN_X, x)),
        min(ARENA_MAX_Y, max(ARENA_MIN_Y, y)),
    )


def tactical_move(state: BattleState, enemy) -> Vec2:
    own = state.own_unit.position
    enemy_pos = enemy.position
    dx = own.x - enemy_pos.x
    dy = own.y - enemy_pos.y
    range_m = math.hypot(dx, dy)

    if range_m < 0.001:
        return waypoint_for_tick(PATROLS[state.self_id], state.tick, 50)

    if range_m > 26.0:
        return waypoint_for_tick(FLANKS[state.self_id], state.tick + state.self_id * 15, 45)

    away_x = dx / range_m
    away_y = dy / range_m
    side = 1.0 if ((state.tick // 35 + state.self_id) % 2 == 0) else -1.0
    perp_x = -away_y * side
    perp_y = away_x * side

    if range_m < 13.0:
        return clamp_point(own.x + away_x * 8.0 + perp_x * 4.0, own.y + away_y * 8.0 + perp_y * 4.0)

    return clamp_point(enemy_pos.x + away_x * 17.0 + perp_x * 7.0, enemy_pos.y + away_y * 17.0 + perp_y * 7.0)


def on_start(spec):
    pass


def on_tick(state: BattleState) -> list[OrderLike]:
    own_unit = state.own_unit
    if own_unit.armor_integrity <= 0:
        return []

    enemy = state.contacts.closest_enemy()
    orders: list[OrderLike] = []

    if enemy:
        move_target = route_around_obstacles(state, tactical_move(state, enemy))
        if should_update_mobility(own_unit.intent.mobility, move_target):
            orders.append(MoveTo(move_target))
        if should_update_turret(own_unit.intent.turret, enemy.position):
            orders.append(AimAt(enemy.position))
        if own_unit.can_fire:
            orders.append(FireIfSolution(min_hit_chance=0.58))
        return orders

    patrol_target = route_around_obstacles(state, waypoint_for_tick(PATROLS[state.self_id], state.tick, 55))
    if should_update_mobility(own_unit.intent.mobility, patrol_target):
        orders.append(MoveTo(patrol_target))
    orders.append(ScanArc(center=own_unit.hull_heading_deg, width_deg=160))
    if not orders and not own_unit.intent.hull.active:
        orders.append(FaceArmorToward(state.map.center))
    return orders


def on_end(result):
    pass


run_bot(on_tick, on_start=on_start, on_end=on_end)
