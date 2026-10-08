# 2D/3D Scene

The renderer is data-driven.

## 3D

React Three Fiber renders only nodes with complete x/y/z coordinates. Node dimensions come directly from PostgreSQL. Container classes use lightweight wireframe rendering; storage leaves use solid meshes.

frameloop=demand, capped device pixel ratio, and disabled shadow maps reduce work on lower-end mobile devices.

The scene has no hard-coded bins, products, coordinates, or stock quantities.

## 2D plan

The plan is a top-down projection of the same spatial data. In edit mode, positioned objects can be dragged. Coordinates are snapped to 0.5 world units before a PATCH is committed.

An object without coordinates remains valid database data and is reported as unpositioned. The editor never invents its position.

## Selection

Selecting a product highlights its mapped location. Selecting a location shows its children and placed products.

## Future editor phases

Walls, doors/windows, richer snapping, copy/paste, templates, floor isolation, versioned scenes, import/tracing, and CAD/blueprint assistance should build on the same spatial-node identity rather than creating a second scene database.
