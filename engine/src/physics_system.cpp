#include <robolocks/physics_system.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include <utility>

namespace robolocks {

namespace {

constexpr double kPositionEpsilon = 1.0e-9;
constexpr double kMinCollisionMassKg = 1.0e-9;
constexpr double kPi = 3.14159265358979323846;

struct BoxAxes {
  Vec2 forward;
  Vec2 right;
};

bool has_box_shape(const PhysicsBody& body) {
  return body.shape.type == BodyShapeType::Box && body.shape.length_m > 0.0 && body.shape.width_m > 0.0;
}

double dot(Vec2 a, Vec2 b) {
  return a.x * b.x + a.y * b.y;
}

Vec2 scaled(Vec2 value, double amount) {
  return Vec2{value.x * amount, value.y * amount};
}

BoxAxes box_axes(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  const Vec2 forward{std::cos(radians), std::sin(radians)};
  return BoxAxes{
    .forward = forward,
    .right = Vec2{-forward.y, forward.x},
  };
}

double box_projection_radius(const PhysicsBody& body, const BoxAxes& axes, Vec2 axis) {
  return (body.shape.length_m * 0.5) * std::abs(dot(axis, axes.forward)) +
         (body.shape.width_m * 0.5) * std::abs(dot(axis, axes.right));
}

Vec2 world_from_box_local(Vec2 local, const BoxAxes& axes) {
  return Vec2{
    axes.forward.x * local.x + axes.right.x * local.y,
    axes.forward.y * local.x + axes.right.y * local.y,
  };
}

Vec2 clamp_circle_to_bounds(Vec2 position, const BattleBounds& bounds, double radius) {
  return Vec2{
    clamp(position.x, bounds.min.x + radius, bounds.max.x - radius),
    clamp(position.y, bounds.min.y + radius, bounds.max.y - radius),
  };
}

Vec2 clamp_body_to_bounds(const PhysicsBody& body, const BattleBounds& bounds) {
  if (!has_box_shape(body)) {
    return clamp_circle_to_bounds(body.position, bounds, body.shape.radius_m);
  }

  const BoxAxes axes = box_axes(body.heading_deg);
  const double half_length = body.shape.length_m * 0.5;
  const double half_width = body.shape.width_m * 0.5;
  const double x_extent = std::abs(axes.forward.x) * half_length + std::abs(axes.right.x) * half_width;
  const double y_extent = std::abs(axes.forward.y) * half_length + std::abs(axes.right.y) * half_width;
  return Vec2{
    clamp(body.position.x, bounds.min.x + x_extent, bounds.max.x - x_extent),
    clamp(body.position.y, bounds.min.y + y_extent, bounds.max.y - y_extent),
  };
}

bool circle_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  const Vec2 delta{
    b.position.x - a.position.x,
    b.position.y - a.position.y,
  };
  const double distance = length(delta);
  const double min_distance = a.shape.radius_m + b.shape.radius_m;
  if (distance >= min_distance) {
    return false;
  }

  normal = Vec2{1.0, 0.0};
  if (distance > kPositionEpsilon) {
    normal = Vec2{delta.x / distance, delta.y / distance};
  }
  penetration = min_distance - distance;
  return true;
}

bool box_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  const BoxAxes a_axes = box_axes(a.heading_deg);
  const BoxAxes b_axes = box_axes(b.heading_deg);
  const std::array<Vec2, 4> axes{a_axes.forward, a_axes.right, b_axes.forward, b_axes.right};
  const Vec2 center_delta{b.position.x - a.position.x, b.position.y - a.position.y};

  bool found_axis = false;
  double min_overlap = 0.0;
  Vec2 min_axis{1.0, 0.0};

  for (Vec2 axis : axes) {
    const double distance = std::abs(dot(center_delta, axis));
    const double overlap = box_projection_radius(a, a_axes, axis) +
                           box_projection_radius(b, b_axes, axis) -
                           distance;
    if (overlap <= 0.0) {
      return false;
    }
    if (!found_axis || overlap < min_overlap) {
      found_axis = true;
      min_overlap = overlap;
      min_axis = axis;
    }
  }

  if (dot(center_delta, min_axis) < 0.0) {
    min_axis = scaled(min_axis, -1.0);
  }
  normal = min_axis;
  penetration = min_overlap;
  return true;
}

bool box_circle_overlap(
  const PhysicsBody& box,
  Vec2 circle_center,
  double circle_radius,
  Vec2& normal,
  double& penetration
) {
  const BoxAxes axes = box_axes(box.heading_deg);
  const double half_length = box.shape.length_m * 0.5;
  const double half_width = box.shape.width_m * 0.5;
  const Vec2 center_delta{
    circle_center.x - box.position.x,
    circle_center.y - box.position.y,
  };
  const Vec2 local_circle{
    dot(center_delta, axes.forward),
    dot(center_delta, axes.right),
  };
  const Vec2 closest_local{
    clamp(local_circle.x, -half_length, half_length),
    clamp(local_circle.y, -half_width, half_width),
  };
  const Vec2 local_delta{
    local_circle.x - closest_local.x,
    local_circle.y - closest_local.y,
  };
  const double distance = length(local_delta);

  if (distance > kPositionEpsilon) {
    if (distance >= circle_radius) {
      return false;
    }
    const Vec2 local_normal{
      -local_delta.x / distance,
      -local_delta.y / distance,
    };
    normal = world_from_box_local(local_normal, axes);
    penetration = circle_radius - distance;
    return true;
  }

  const double left_clearance = local_circle.x + half_length;
  const double right_clearance = half_length - local_circle.x;
  const double bottom_clearance = local_circle.y + half_width;
  const double top_clearance = half_width - local_circle.y;

  double min_clearance = left_clearance;
  Vec2 local_normal{1.0, 0.0};
  if (right_clearance < min_clearance) {
    min_clearance = right_clearance;
    local_normal = Vec2{-1.0, 0.0};
  }
  if (bottom_clearance < min_clearance) {
    min_clearance = bottom_clearance;
    local_normal = Vec2{0.0, 1.0};
  }
  if (top_clearance < min_clearance) {
    min_clearance = top_clearance;
    local_normal = Vec2{0.0, -1.0};
  }

  normal = world_from_box_local(local_normal, axes);
  penetration = circle_radius + min_clearance;
  return true;
}

bool body_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  if (has_box_shape(a) && has_box_shape(b)) {
    return box_overlap(a, b, normal, penetration);
  }
  return circle_overlap(a, b, normal, penetration);
}

void resolve_obstacles(
  Tick tick,
  const std::vector<StaticObstacle>& obstacles,
  const BattleBounds& bounds,
  PhysicsBody& body,
  std::vector<Event>& events
) {
  for (const auto& obstacle : obstacles) {
    if (!obstacle.blocks_movement) {
      continue;
    }

    Vec2 normal{-1.0, 0.0};
    double overlap = 0.0;
    if (has_box_shape(body)) {
      if (!box_circle_overlap(body, obstacle.position, obstacle.radius_m, normal, overlap)) {
        continue;
      }
    } else {
      const Vec2 delta{
        body.position.x - obstacle.position.x,
        body.position.y - obstacle.position.y,
      };
      const double distance = length(delta);
      const double min_distance = body.shape.radius_m + obstacle.radius_m;
      if (distance >= min_distance) {
        continue;
      }

      if (distance > kPositionEpsilon) {
        normal = Vec2{delta.x / distance, delta.y / distance};
      }
      overlap = min_distance - distance;
    }

    if (overlap <= 0.0) {
      continue;
    }

    body.position = Vec2{
      body.position.x + normal.x * overlap,
      body.position.y + normal.y * overlap,
    };
    events.push_back(Event{
      .tick = tick,
      .unit_id = body.unit_id,
      .code = "obstacle_collision",
      .message = "Collided with obstacle " + obstacle.id + ".",
    });
  }

  body.position = clamp_body_to_bounds(body, bounds);
}

}  // namespace

PhysicsSystem::PhysicsSystem(BattleBounds bounds, std::vector<StaticObstacle> obstacles)
    : bounds_(bounds), obstacles_(std::move(obstacles)) {}

std::vector<Event> PhysicsSystem::resolve(Tick tick, std::vector<PhysicsBody>& bodies) const {
  std::vector<Event> events;

  for (auto& body : bodies) {
    resolve_obstacles(tick, obstacles_, bounds_, body, events);
  }

  for (std::size_t i = 0; i < bodies.size(); i += 1) {
    for (std::size_t j = i + 1; j < bodies.size(); j += 1) {
      auto& a = bodies[i];
      auto& b = bodies[j];
      Vec2 normal{1.0, 0.0};
      double penetration = 0.0;
      if (!body_overlap(a, b, normal, penetration)) {
        continue;
      }

      const double a_mass = std::max(a.mass_kg, kMinCollisionMassKg);
      const double b_mass = std::max(b.mass_kg, kMinCollisionMassKg);
      const double a_inverse_mass = 1.0 / a_mass;
      const double b_inverse_mass = 1.0 / b_mass;
      const double inverse_mass_sum = a_inverse_mass + b_inverse_mass;
      const double a_share = inverse_mass_sum > 0.0 ? a_inverse_mass / inverse_mass_sum : 0.5;
      const double b_share = inverse_mass_sum > 0.0 ? b_inverse_mass / inverse_mass_sum : 0.5;

      a.position = Vec2{
        a.position.x - normal.x * penetration * a_share,
        a.position.y - normal.y * penetration * a_share,
      };
      b.position = Vec2{
        b.position.x + normal.x * penetration * b_share,
        b.position.y + normal.y * penetration * b_share,
      };
      a.position = clamp_body_to_bounds(a, bounds_);
      b.position = clamp_body_to_bounds(b, bounds_);

      events.push_back(Event{
        .tick = tick,
        .unit_id = a.unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(b.unit_id.value) + ".",
      });
      events.push_back(Event{
        .tick = tick,
        .unit_id = b.unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(a.unit_id.value) + ".",
      });
    }
  }

  return events;
}

}  // namespace robolocks
