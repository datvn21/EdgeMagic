use serde::Serialize;

pub const CANVAS_WIDTH_LOGICAL: f64 = 380.0;
pub const SURFACE_HEIGHT_LOGICAL: f64 = 820.0;
pub const SURFACE_MARGIN_LOGICAL: f64 = 12.0;
pub const COLLAPSED_THICKNESS_LOGICAL: f64 = 24.0;
pub const COLLAPSED_HEIGHT_LOGICAL: f64 = 72.0;
pub const SURFACE_CORNER_DIAMETER_LOGICAL: f64 = 40.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EdgePosition {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EdgeGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub surface_top: i32,
    pub surface_height: u32,
    pub collapsed_thickness: u32,
    pub collapsed_height: u32,
    pub corner_diameter: u32,
}

pub fn calculate(work: WorkArea, scale_factor: f64, position: EdgePosition) -> EdgeGeometry {
    let physical = |logical: f64| (logical * scale_factor).round().max(1.0) as u32;
    let width = physical(CANVAS_WIDTH_LOGICAL).min(work.width);
    let margin = physical(SURFACE_MARGIN_LOGICAL).min(work.height / 2);
    let available_height = work.height.saturating_sub(margin.saturating_mul(2));
    let surface_height = physical(SURFACE_HEIGHT_LOGICAL)
        .min(available_height)
        .max(1);
    let surface_top = ((work.height.saturating_sub(surface_height)) / 2) as i32;
    let x = match position {
        EdgePosition::Left => work.x,
        EdgePosition::Right => work.x + work.width as i32 - width as i32,
    };
    EdgeGeometry {
        x,
        y: work.y,
        width,
        height: work.height,
        surface_top,
        surface_height,
        collapsed_thickness: physical(COLLAPSED_THICKNESS_LOGICAL).min(width),
        collapsed_height: physical(COLLAPSED_HEIGHT_LOGICAL).min(surface_height),
        corner_diameter: physical(SURFACE_CORNER_DIAMETER_LOGICAL),
    }
}

pub fn bounds_for_mode(canvas: EdgeGeometry, mode: &str, position: EdgePosition) -> EdgeGeometry {
    if mode == "collapsed" {
        let x = match position {
            EdgePosition::Left => canvas.x,
            EdgePosition::Right => {
                canvas.x + canvas.width as i32 - canvas.collapsed_thickness as i32
            }
        };
        return EdgeGeometry {
            x,
            y: canvas.y
                + canvas.surface_top
                + ((canvas
                    .surface_height
                    .saturating_sub(canvas.collapsed_height))
                    / 2) as i32,
            width: canvas.collapsed_thickness,
            height: canvas.collapsed_height,
            surface_top: 0,
            surface_height: canvas.collapsed_height,
            ..canvas
        };
    }

    EdgeGeometry {
        y: canvas.y + canvas.surface_top,
        height: canvas.surface_height,
        surface_top: 0,
        ..canvas
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchors_to_left_and_right_with_negative_coordinates() {
        let work = WorkArea {
            x: -1920,
            y: 40,
            width: 1920,
            height: 1040,
        };
        assert_eq!(calculate(work, 1.0, EdgePosition::Left).x, -1920);
        let right = calculate(work, 1.0, EdgePosition::Right);
        assert_eq!(right.x, -380);
        assert_eq!(right.surface_height, 820);
        assert_eq!(right.surface_top, 110);
    }

    #[test]
    fn scales_and_clamps_to_small_work_areas() {
        let result = calculate(
            WorkArea {
                x: 0,
                y: 0,
                width: 600,
                height: 700,
            },
            1.5,
            EdgePosition::Right,
        );
        assert_eq!(result.width, 570);
        assert_eq!(result.surface_height, 664);
        assert_eq!(result.collapsed_thickness, 36);
        assert_eq!(result.collapsed_height, 108);
    }

    #[test]
    fn dpi_matrix_keeps_logical_contract() {
        for scale in [1.0, 1.25, 1.5, 1.75, 2.0] {
            let result = calculate(
                WorkArea {
                    x: 1920,
                    y: -80,
                    width: 2560,
                    height: 1440,
                },
                scale,
                EdgePosition::Right,
            );
            assert_eq!(result.width, (CANVAS_WIDTH_LOGICAL * scale).round() as u32);
            assert_eq!(
                result.collapsed_thickness,
                (COLLAPSED_THICKNESS_LOGICAL * scale).round() as u32
            );
            assert_eq!(
                result.collapsed_height,
                (COLLAPSED_HEIGHT_LOGICAL * scale).round() as u32
            );
            assert_eq!(
                result.corner_diameter,
                (SURFACE_CORNER_DIAMETER_LOGICAL * scale).round() as u32
            );
            assert_eq!(result.x + result.width as i32, 4480);
            assert!(result.surface_height <= (SURFACE_HEIGHT_LOGICAL * scale).round() as u32);
        }
    }

    #[test]
    fn mode_bounds_match_visible_surface() {
        let canvas = calculate(
            WorkArea {
                x: 0,
                y: 0,
                width: 1920,
                height: 1152,
            },
            1.0,
            EdgePosition::Right,
        );
        let collapsed = bounds_for_mode(canvas, "collapsed", EdgePosition::Right);
        assert_eq!(
            (collapsed.x, collapsed.y, collapsed.width, collapsed.height),
            (1896, 540, 24, 72)
        );
        let shelf = bounds_for_mode(canvas, "shelf", EdgePosition::Right);
        assert_eq!(
            (shelf.x, shelf.y, shelf.width, shelf.height),
            (1540, 166, 380, 820)
        );
        assert_eq!(shelf.surface_top, 0);
    }
}
