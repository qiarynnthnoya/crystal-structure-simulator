import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

/* =========================================================
   CRYSTAL STRUCTURE SIMULATOR
   NaCl / HCP / Diamond
   ========================================================= */

// ---------------------------------------------------------
// BASIC SETUP
// ---------------------------------------------------------

const simulator = document.querySelector(".simulator");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111820);

// Separate groups = much easier to control
const crystalGroup = new THREE.Group();
const bondGroup = new THREE.Group();
const unitCellGroup = new THREE.Group();
const labelGroup = new THREE.Group();

scene.add(crystalGroup);
scene.add(bondGroup);
scene.add(unitCellGroup);
scene.add(labelGroup);

// ---------------------------------------------------------
// CAMERA
// ---------------------------------------------------------

const camera = new THREE.PerspectiveCamera(
    45,
    simulator.clientWidth / simulator.clientHeight,
    0.1,
    100
);

camera.position.set(5, 4, 5);

// ---------------------------------------------------------
// RENDERER
// ---------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(
    simulator.clientWidth,
    simulator.clientHeight
);

renderer.localClippingEnabled = true;

simulator.appendChild(renderer.domElement);

// ---------------------------------------------------------
// LIGHTING
// ---------------------------------------------------------

const ambientLight = new THREE.AmbientLight(
    0xffffff,
    2
);

scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    2
);

directionalLight.position.set(5, 8, 5);
scene.add(directionalLight);

// ---------------------------------------------------------
// ORBIT CONTROLS
// ---------------------------------------------------------

const controls = new OrbitControls(
    camera,
    renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.08;

controls.enablePan = true;

controls.minDistance = 2.5;
controls.maxDistance = 15;

controls.zoomSpeed = 0.6;

// ---------------------------------------------------------
// COLORS
// ---------------------------------------------------------

const COLORS = {
    Na: 0x9b59b6,
    Cl: 0x5ee37b,
    Diamond: 0x62d9ff,
    Bond: 0xffffff,
    Cell: 0xffffff,
    Label: 0xffffff
};

// ---------------------------------------------------------
// GLOBAL STATE
// ---------------------------------------------------------

let currentStructure = "NaCl";

let contributionMode = false;
let labelsVisible = true;

let currentCellType = "cubic";

// Camera distance
let currentDistance = 7;
let targetDistance = 7;

// ---------------------------------------------------------
// DATA FOR CURRENT STRUCTURE
// ---------------------------------------------------------

let currentAtoms = [];

/*
Each atom stores:

{
    mesh,
    position,
    type,
    contribution,
    category,
    radius
}
*/

// =========================================================
// UTILITY FUNCTIONS
// =========================================================

// ---------------------------------------------------------
// CLEAR SCENE GROUPS
// ---------------------------------------------------------

function clearGroup(group) {

    while (group.children.length > 0) {

        const object = group.children[0];

        if (object.geometry) {
            object.geometry.dispose();
        }

        if (object.material) {

            if (Array.isArray(object.material)) {

                object.material.forEach(material => {
                    material.dispose();
                });

            } else {

                object.material.dispose();

            }
        }

        group.remove(object);
    }
}

// ---------------------------------------------------------
// CLEAR CRYSTAL
// ---------------------------------------------------------

function clearCrystal() {

    clearGroup(crystalGroup);
    clearGroup(bondGroup);
    clearGroup(unitCellGroup);
    clearGroup(labelGroup);

    currentAtoms = [];
}

// ---------------------------------------------------------
// CREATE ATOM
// ---------------------------------------------------------

function createAtom({
    x,
    y,
    z,
    color,
    radius = 0.3,
    type = "Atom",
    contribution = 1,
    category = "internal"
}) {

    const geometry = new THREE.SphereGeometry(
        radius,
        32,
        32
    );

    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.35,
        metalness: 0.1,
        clippingPlanes: []
    });

    const atom = new THREE.Mesh(
        geometry,
        material
    );

    atom.position.set(x, y, z);

    atom.userData = {
        type,
        contribution,
        category,
        originalColor: color,
        radius
    };

    crystalGroup.add(atom);

    const data = {
        mesh: atom,
        position: new THREE.Vector3(x, y, z),
        type,
        contribution,
        category,
        radius
    };

    currentAtoms.push(data);

    return data;
}

// ---------------------------------------------------------
// CREATE BOND
// ---------------------------------------------------------

function createBond(
    p1,
    p2
) {

    const points = [
        new THREE.Vector3(
            p1.x,
            p1.y,
            p1.z
        ),
        new THREE.Vector3(
            p2.x,
            p2.y,
            p2.z
        )
    ];

    const geometry =
        new THREE.BufferGeometry()
            .setFromPoints(points);

    const material =
        new THREE.LineBasicMaterial({
            color: COLORS.Bond,
            transparent: true,
            opacity: 0.35
        });

    const bond =
        new THREE.Line(
            geometry,
            material
        );

    bondGroup.add(bond);

    return bond;
}

// ---------------------------------------------------------
// DISTANCE CHECK
// ---------------------------------------------------------

function distanceBetween(a, b) {

    return a.distanceTo(b);

}

// ---------------------------------------------------------
// ADD BONDS BETWEEN NEAREST ATOMS
// ---------------------------------------------------------

function connectNearestAtoms(
    distance,
    tolerance = 0.03
) {

    for (let i = 0; i < currentAtoms.length; i++) {

        for (
            let j = i + 1;
            j < currentAtoms.length;
            j++
        ) {

            const a = currentAtoms[i];
            const b = currentAtoms[j];

            const d =
                distanceBetween(
                    a.position,
                    b.position
                );

            if (
                Math.abs(d - distance)
                < tolerance
            ) {

                createBond(
                    a.position,
                    b.position
                );

            }
        }
    }
}

// =========================================================
// UNIT CELL FUNCTIONS
// =========================================================

// ---------------------------------------------------------
// CUBIC UNIT CELL
// ---------------------------------------------------------

function buildCubicUnitCell(size) {

    currentCellType = "cubic";

    const geometry =
        new THREE.BoxGeometry(
            size,
            size,
            size
        );

    const edges =
        new THREE.EdgesGeometry(
            geometry
        );

    const material =
        new THREE.LineBasicMaterial({
            color: COLORS.Cell,
            transparent: true,
            opacity: 0.75
        });

    const cell =
        new THREE.LineSegments(
            edges,
            material
        );

    cell.position.set(
        size / 2,
        size / 2,
        size / 2
    );

    unitCellGroup.add(cell);

}

// ---------------------------------------------------------
// HCP UNIT CELL
// ---------------------------------------------------------

function buildHCPUnitCell(
    radius,
    height
) {

    currentCellType = "hcp";

    const verticesBottom = [];
    const verticesTop = [];

    for (let i = 0; i < 6; i++) {

        const angle =
            i * Math.PI / 3;

        verticesBottom.push(
            new THREE.Vector3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                -height / 2
            )
        );

        verticesTop.push(
            new THREE.Vector3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                height / 2
            )
        );
    }

    const points = [];

    // Bottom hexagon
    for (let i = 0; i < 6; i++) {

        const next =
            (i + 1) % 6;

        points.push(
            verticesBottom[i],
            verticesBottom[next]
        );
    }

    // Top hexagon
    for (let i = 0; i < 6; i++) {

        const next =
            (i + 1) % 6;

        points.push(
            verticesTop[i],
            verticesTop[next]
        );
    }

    // Vertical edges
    for (let i = 0; i < 6; i++) {

        points.push(
            verticesBottom[i],
            verticesTop[i]
        );
    }

    const geometry =
        new THREE.BufferGeometry()
            .setFromPoints(points);

    const material =
        new THREE.LineBasicMaterial({
            color: COLORS.Cell,
            transparent: true,
            opacity: 0.8
        });

    const cell =
        new THREE.LineSegments(
            geometry,
            material
        );

    unitCellGroup.add(cell);
}

// =========================================================
// CLIPPING PLANES
// =========================================================

// ---------------------------------------------------------
// CUBIC CLIPPING PLANES
//
// Cell:
//
// 0 <= x <= a
// 0 <= y <= a
// 0 <= z <= a
// ---------------------------------------------------------

function getCubicClippingPlanes(a) {

    return [

        // x >= 0
        new THREE.Plane(
            new THREE.Vector3(1, 0, 0),
            0
        ),

        // x <= a
        new THREE.Plane(
            new THREE.Vector3(-1, 0, 0),
            a
        ),

        // y >= 0
        new THREE.Plane(
            new THREE.Vector3(0, 1, 0),
            0
        ),

        // y <= a
        new THREE.Plane(
            new THREE.Vector3(0, -1, 0),
            a
        ),

        // z >= 0
        new THREE.Plane(
            new THREE.Vector3(0, 0, 1),
            0
        ),

        // z <= a
        new THREE.Plane(
            new THREE.Vector3(0, 0, -1),
            a
        )

    ];
}

// ---------------------------------------------------------
// HCP CLIPPING PLANES
//
// Regular hexagonal prism
// ---------------------------------------------------------

function getHCPClippingPlanes(
    radius,
    height
) {

    const planes = [];

    const apothem =
        radius * Math.sqrt(3) / 2;

    // Six side planes
    for (let i = 0; i < 6; i++) {

        const angle =
            Math.PI / 6 +
            i * Math.PI / 3;

        /*
        The normal points inward.

        This keeps the inside
        of the hexagonal prism.
        */

        const normal =
            new THREE.Vector3(
                -Math.cos(angle),
                -Math.sin(angle),
                0
            );

        planes.push(
            new THREE.Plane(
                normal,
                apothem
            )
        );
    }

    // Bottom plane
    planes.push(
        new THREE.Plane(
            new THREE.Vector3(0, 0, 1),
            height / 2
        )
    );

    // Top plane
    planes.push(
        new THREE.Plane(
            new THREE.Vector3(0, 0, -1),
            height / 2
        )
    );

    return planes;
}

// ---------------------------------------------------------
// APPLY CONTRIBUTION CLIPPING
// ---------------------------------------------------------

function applyContributionClipping() {

    let planes = [];

    if (currentCellType === "cubic") {

        const size =
            currentStructure === "Diamond"
                ? 2
                : 2;

        planes =
            getCubicClippingPlanes(size);

    }

    if (currentCellType === "hcp") {

        const radius = 1.6;

        const height =
            radius * Math.sqrt(8 / 3);

        planes =
            getHCPClippingPlanes(
                radius,
                height
            );
    }

    currentAtoms.forEach(atom => {

        if (contributionMode) {

            atom.mesh.material.clippingPlanes =
                planes;

        } else {

            atom.mesh.material.clippingPlanes =
                [];

        }

    });

}

// =========================================================
// LABEL SYSTEM
// =========================================================

// ---------------------------------------------------------
// CREATE TEXT SPRITE
// ---------------------------------------------------------
function createLabel(
    text,
    position
) {

    const canvas =
        document.createElement("canvas");

    canvas.width = 420;
    canvas.height = 120;

    const context =
        canvas.getContext("2d");

    context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // Background
    context.fillStyle =
        "rgba(15, 23, 32, 0.92)";

    context.roundRect(
        8,
        8,
        404,
        104,
        18
    );

    context.fill();

    // Border
    context.strokeStyle =
        "#9b59b6";

    context.lineWidth = 4;

    context.stroke();

    // Text
    context.fillStyle =
        "#ffffff";

    context.font =
        "bold 32px Arial";

    context.textAlign =
        "center";

    context.textBaseline =
        "middle";

    context.fillText(
        text,
        210,
        60
    );

    const texture =
        new THREE.CanvasTexture(
            canvas
        );

    texture.needsUpdate = true;

    const material =
        new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

    const sprite =
        new THREE.Sprite(
            material
        );

    sprite.position.copy(
        position
    );

    sprite.scale.set(
        0.85,
        0.24,
        1
    );

    labelGroup.add(
        sprite
    );

}

// ---------------------------------------------------------
// UPDATE LABELS
// ---------------------------------------------------------

function updateContributionLabels() {

    clearGroup(labelGroup);

    // Only show labels when Contribution mode is ON
    if (!contributionMode || !labelsVisible) {
        return;
    }

    // -----------------------------------------------------
    // Find ONE representative atom for each category
    // -----------------------------------------------------

    const representatives = new Map();

    currentAtoms.forEach(atom => {

        if (!representatives.has(atom.category)) {
            representatives.set(
                atom.category,
                atom
            );
        }

    });

    // -----------------------------------------------------
    // Label text
    // -----------------------------------------------------

    const labelNames = {

        corner: "Corner  →  1/8",

        edge: "Edge  →  1/4",

        face: "Face  →  1/2",

        body: "Body  →  1",

        internal: "Middle  →  1"

    };

    // -----------------------------------------------------
    // HCP uses different contribution for corners
    // -----------------------------------------------------

    if (currentStructure === "HCP") {

        labelNames.corner =
            "Corner  →  1/6";

        labelNames.face =
            "Basal Face  →  1/2";

        labelNames.internal =
            "Middle  →  1";

    }

    // -----------------------------------------------------
    // Create only ONE label per category
    // -----------------------------------------------------

    representatives.forEach(
        (atom, category) => {

            const text =
                labelNames[category];

            if (!text) {
                return;
            }

            // Move label slightly away from atom
            const direction =
                atom.position.clone();

            if (currentStructure === "HCP") {

                direction.z *= 0.3;

            }

            direction.normalize();

            const labelPosition =
                atom.position.clone()
                    .add(
                        direction.multiplyScalar(
                            0.45
                        )
                    );

            labelPosition.y += 0.15;

            createLabel(
                text,
                labelPosition
            );

        }
    );

}
// =========================================================
// NACL
// =========================================================

function buildNaCl() {

    const a = 2;

    const rCl = 0.30;
    const rNa = 0.22;

    // -----------------------------------------------------
    // Cl- CORNER ATOMS
    // Contribution = 1/8
    // -----------------------------------------------------

    for (let x of [0, a]) {
        for (let y of [0, a]) {
            for (let z of [0, a]) {

                createAtom({
                    x,
                    y,
                    z,
                    color: COLORS.Cl,
                    radius: rCl,
                    type: "Cl⁻",
                    contribution: 1 / 8,
                    category: "corner"
                });

            }
        }
    }

    // -----------------------------------------------------
    // Cl- FACE CENTER ATOMS
    // Contribution = 1/2
    // -----------------------------------------------------

    const faceCenters = [

        [a / 2, a / 2, 0],
        [a / 2, a / 2, a],

        [a / 2, 0, a / 2],
        [a / 2, a, a / 2],

        [0, a / 2, a / 2],
        [a, a / 2, a / 2]

    ];

    faceCenters.forEach(p => {

        createAtom({
            x: p[0],
            y: p[1],
            z: p[2],
            color: COLORS.Cl,
            radius: rCl,
            type: "Cl⁻",
            contribution: 1 / 2,
            category: "face"
        });

    });

    // -----------------------------------------------------
    // Na+ EDGE CENTER ATOMS
    // Contribution = 1/4
    // -----------------------------------------------------

    const edgeCenters = [

        // x direction
        [a / 2, 0, 0],
        [a / 2, a, 0],
        [a / 2, 0, a],
        [a / 2, a, a],

        // y direction
        [0, a / 2, 0],
        [a, a / 2, 0],
        [0, a / 2, a],
        [a, a / 2, a],

        // z direction
        [0, 0, a / 2],
        [a, 0, a / 2],
        [0, a, a / 2],
        [a, a, a / 2]

    ];

    edgeCenters.forEach(p => {

        createAtom({
            x: p[0],
            y: p[1],
            z: p[2],
            color: COLORS.Na,
            radius: rNa,
            type: "Na⁺",
            contribution: 1 / 4,
            category: "edge"
        });

    });

    // -----------------------------------------------------
    // Na+ BODY CENTER
    // Contribution = 1
    // -----------------------------------------------------

    createAtom({
        x: a / 2,
        y: a / 2,
        z: a / 2,
        color: COLORS.Na,
        radius: rNa,
        type: "Na⁺",
        contribution: 1,
        category: "body"
    });

    // -----------------------------------------------------
    // BONDS
    // -----------------------------------------------------

    connectNearestAtoms(
        a / 2,
        0.03
    );

    // -----------------------------------------------------
    // UNIT CELL
    // -----------------------------------------------------

    buildCubicUnitCell(a);

    // Camera
    setCameraTarget(
        new THREE.Vector3(
            a / 2,
            a / 2,
            a / 2
        ),
        6
    );

}

// =========================================================
// HCP
// =========================================================

function buildHCP() {

    const a = 1.6;

    const c =
        a * Math.sqrt(8 / 3);

    const rAtom = 0.27;

    // -----------------------------------------------------
    // HEXAGON RADIUS
    // -----------------------------------------------------

    const radius = a;

    // -----------------------------------------------------
    // BOTTOM A-LAYER
    //
    // 6 corner atoms
    // Contribution = 1/6
    // -----------------------------------------------------

    for (let i = 0; i < 6; i++) {

        const angle =
            i * Math.PI / 3;

        createAtom({

            x:
                radius *
                Math.cos(angle),

            y:
                radius *
                Math.sin(angle),

            z:
                -c / 2,

            color: COLORS.Cl,

            radius: rAtom,

            type: "A-layer",

            contribution: 1 / 6,

            category: "corner"

        });

    }

    // -----------------------------------------------------
    // TOP A-LAYER
    // -----------------------------------------------------

    for (let i = 0; i < 6; i++) {

        const angle =
            i * Math.PI / 3;

        createAtom({

            x:
                radius *
                Math.cos(angle),

            y:
                radius *
                Math.sin(angle),

            z:
                c / 2,

            color: COLORS.Cl,

            radius: rAtom,

            type: "A-layer",

            contribution: 1 / 6,

            category: "corner"

        });

    }

    // -----------------------------------------------------
    // BASAL FACE CENTER ATOMS
    //
    // Contribution = 1/2
    // -----------------------------------------------------

    createAtom({

        x: 0,
        y: 0,
        z: -c / 2,

        color: COLORS.Cl,

        radius: rAtom,

        type: "A-layer",

        contribution: 1 / 2,

        category: "face"

    });

    createAtom({

        x: 0,
        y: 0,
        z: c / 2,

        color: COLORS.Cl,

        radius: rAtom,

        type: "A-layer",

        contribution: 1 / 2,

        category: "face"

    });

    // -----------------------------------------------------
    // MIDDLE B-LAYER
    //
    // 3 atoms
    // Contribution = 1
    // -----------------------------------------------------

    const middleRadius =
        a / Math.sqrt(3);

    for (let i = 0; i < 3; i++) {

        const angle =
            Math.PI / 6 +
            i * (2 * Math.PI / 3);

        createAtom({

            x:
                middleRadius *
                Math.cos(angle),

            y:
                middleRadius *
                Math.sin(angle),

            z: 0,

            color: COLORS.Cl,

            radius: rAtom,

            type: "B-layer",

            contribution: 1,

            category: "internal"

        });

    }

    // -----------------------------------------------------
    // HCP BONDS
    // -----------------------------------------------------

    const bottom = [];
    const top = [];

    // bottom / top corner positions
    for (let i = 0; i < 6; i++) {

        const angle =
            i * Math.PI / 3;

        bottom.push(
            new THREE.Vector3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                -c / 2
            )
        );

        top.push(
            new THREE.Vector3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                c / 2
            )
        );
    }

    // Hexagon edges
    for (let i = 0; i < 6; i++) {

        const next =
            (i + 1) % 6;

        createBond(
            bottom[i],
            bottom[next]
        );

        createBond(
            top[i],
            top[next]
        );

    }

    // Middle layer atom positions
    const middle = [];

    for (let i = 0; i < 3; i++) {

        const angle =
            Math.PI / 6 +
            i * (2 * Math.PI / 3);

        middle.push(
            new THREE.Vector3(
                middleRadius * Math.cos(angle),
                middleRadius * Math.sin(angle),
                0
            )
        );

    }

    // Each middle atom connects to
    // two bottom + two top atoms
    const pairs = [
        [0, 1],
        [2, 3],
        [4, 5]
    ];

    for (let i = 0; i < 3; i++) {

        const [v1, v2] =
            pairs[i];

        createBond(
            middle[i],
            bottom[v1]
        );

        createBond(
            middle[i],
            bottom[v2]
        );

        createBond(
            middle[i],
            top[v1]
        );

        createBond(
            middle[i],
            top[v2]
        );

    }

    // Middle-layer triangle
    createBond(
        middle[0],
        middle[1]
    );

    createBond(
        middle[1],
        middle[2]
    );

    createBond(
        middle[2],
        middle[0]
    );

    // -----------------------------------------------------
    // UNIT CELL
    // -----------------------------------------------------

    buildHCPUnitCell(
        radius,
        c
    );

    // -----------------------------------------------------
    // CAMERA
    // -----------------------------------------------------

    setCameraTarget(
        new THREE.Vector3(
            0,
            0,
            0
        ),
        7
    );

}

// =========================================================
// DIAMOND
// =========================================================

function buildDiamond() {

    const a = 2;

    const r = 0.26;

    // -----------------------------------------------------
    // FCC CORNER ATOMS
    // Contribution = 1/8
    // -----------------------------------------------------

    for (let x of [0, a]) {
        for (let y of [0, a]) {
            for (let z of [0, a]) {

                createAtom({

                    x,
                    y,
                    z,

                    color:
                        COLORS.Diamond,

                    radius: r,

                    type: "C",

                    contribution: 1 / 8,

                    category: "corner"

                });

            }
        }
    }

    // -----------------------------------------------------
    // FCC FACE CENTER ATOMS
    // Contribution = 1/2
    // -----------------------------------------------------

    const faceCenters = [

        [0, a / 2, a / 2],
        [a, a / 2, a / 2],

        [a / 2, 0, a / 2],
        [a / 2, a, a / 2],

        [a / 2, a / 2, 0],
        [a / 2, a / 2, a]

    ];

    faceCenters.forEach(p => {

        createAtom({

            x: p[0],
            y: p[1],
            z: p[2],

            color:
                COLORS.Diamond,

            radius: r,

            type: "C",

            contribution: 1 / 2,

            category: "face"

        });

    });

    // -----------------------------------------------------
    // FOUR INTERNAL DIAMOND BASIS ATOMS
    // Contribution = 1
    // -----------------------------------------------------

    const internal = [

        [a / 4, a / 4, a / 4],

        [a / 4, 3 * a / 4, 3 * a / 4],

        [3 * a / 4, a / 4, 3 * a / 4],

        [3 * a / 4, 3 * a / 4, a / 4]

    ];

    internal.forEach(p => {

        createAtom({

            x: p[0],
            y: p[1],
            z: p[2],

            color:
                COLORS.Diamond,

            radius: r,

            type: "C",

            contribution: 1,

            category: "internal"

        });

    });

    // -----------------------------------------------------
    // DIAMOND BONDS
    //
    // Nearest-neighbour distance:
    // a * sqrt(3) / 4
    // -----------------------------------------------------

    const nearestDistance =
        a * Math.sqrt(3) / 4;

    connectNearestAtoms(
        nearestDistance,
        0.04
    );

    // -----------------------------------------------------
    // UNIT CELL
    // -----------------------------------------------------

    buildCubicUnitCell(a);

    // -----------------------------------------------------
    // CAMERA
    // -----------------------------------------------------

    setCameraTarget(
        new THREE.Vector3(
            a / 2,
            a / 2,
            a / 2
        ),
        6.5
    );

}

// =========================================================
// CAMERA
// =========================================================

function setCameraTarget(
    target,
    distance
) {

    controls.target.copy(target);

    const direction =
        new THREE.Vector3(
            1,
            0.8,
            1
        ).normalize();

    camera.position.copy(
        target.clone().add(
            direction.multiplyScalar(
                distance
            )
        )
    );

    currentDistance =
        distance;

    targetDistance =
        distance;

    controls.update();

}

// ---------------------------------------------------------
// RESET CAMERA
// ---------------------------------------------------------

function resetCamera() {

    if (currentStructure === "HCP") {

        setCameraTarget(
            new THREE.Vector3(0, 0, 0),
            7
        );

    } else {

        setCameraTarget(
            new THREE.Vector3(1, 1, 1),
            6
        );

    }

}
// =========================================================
// UNIT-CELL CONTRIBUTION INFORMATION
// =========================================================

function updateContributionInfo() {

    const calculation =
        document.getElementById(
            "contribution-calculation"
        );

    if (!calculation) {
        return;
    }


    // -----------------------------------------------------
    // NaCl
    // -----------------------------------------------------

    if (currentStructure === "NaCl") {

        calculation.innerHTML = `
    <div class="contribution-row">
        <span>8 atom sudut</span>
        <strong>8 × 1/8 = 1</strong>
    </div>

    <div class="contribution-row">
        <span>6 atom bidang</span>
        <strong>6 × 1/2 = 3</strong>
    </div>

    <div class="contribution-row">
        <span>12 atom rusuk</span>
        <strong>12 × 1/4 = 3</strong>
    </div>

    <div class="contribution-row">
        <span>1 atom pusat</span>
        <strong>1 × 1 = 1</strong>
    </div>

    <div class="contribution-total">
        Total = <strong>8 ion / sel satuan</strong>
    </div>
`;

    }


    // -----------------------------------------------------
    // HCP
    // -----------------------------------------------------

    else if (currentStructure === "HCP") {

        calculation.innerHTML = `
    <div class="contribution-row">
        <span>12 atom sudut</span>
        <strong>12 × 1/6 = 2</strong>
    </div>

    <div class="contribution-row">
        <span>2 atom pusat bidang dasar</span>
        <strong>2 × 1/2 = 1</strong>
    </div>

    <div class="contribution-row">
        <span>3 atom lapisan tengah</span>
        <strong>3 × 1 = 3</strong>
    </div>

    <div class="contribution-total">
        Total = <strong>6 atom / sel satuan</strong>
    </div>
`;

    }


    // -----------------------------------------------------
    // Diamond
    // -----------------------------------------------------

    else if (currentStructure === "Diamond") {

        calculation.innerHTML = `
    <div class="contribution-row">
        <span>8 atom sudut</span>
        <strong>8 × 1/8 = 1</strong>
    </div>

    <div class="contribution-row">
        <span>6 atom bidang</span>
        <strong>6 × 1/2 = 3</strong>
    </div>

    <div class="contribution-row">
        <span>4 atom bagian dalam</span>
        <strong>4 × 1 = 4</strong>
    </div>

    <div class="contribution-total">
        Total = <strong>8 atom / sel satuan</strong>
    </div>
`;

    }

}
// =========================================================
// CONTRIBUTION MODE
// =========================================================

function updateContributionMode() {

    applyContributionClipping();

    updateContributionLabels();

}

// =========================================================
// INFO PANEL
// =========================================================
function updateInfo(structure) {

    const name =
        document.getElementById("structure-name");

    const subtitle =
        document.getElementById("structure-subtitle");

    const crystalSystem =
        document.getElementById("crystal-system");

    const lattice =
        document.getElementById("lattice-type");

    const atomsPerCell =
        document.getElementById("atoms-per-cell");

    const coordination =
        document.getElementById("coordination-number");

    const type =
        document.getElementById("structure-type");

    const packing =
        document.getElementById("packing");

    const bonding =
        document.getElementById("bonding-type");

    const latticeParameter =
        document.getElementById("lattice-parameter");

    const description =
        document.getElementById("structure-description");


    if (
        !name ||
        !subtitle ||
        !crystalSystem ||
        !lattice ||
        !atomsPerCell ||
        !coordination ||
        !type ||
        !packing ||
        !bonding ||
        !latticeParameter ||
        !description
    ) {
        console.warn(
            "Beberapa elemen panel informasi tidak ditemukan."
        );
        return;
    }


    if (structure === "NaCl") {

        name.textContent = "NaCl";

        subtitle.textContent =
            "Struktur Garam Batu";

        crystalSystem.textContent =
            "Kubik";

        lattice.textContent =
            "Face-Centered Cubic (FCC)";

        atomsPerCell.textContent =
            "8 ion";

        coordination.textContent =
            "6";

        type.textContent =
            "Kristal Ionik";

        packing.textContent =
            "≈ 52%";

        bonding.textContent =
            "Ionik";

        latticeParameter.innerHTML =
            "a = 2(r<sub>Na+</sub> + r<sub>Cl−</sub>)";

        description.textContent =
            "NaCl memiliki struktur garam batu yang " +
            "terdiri dari dua subkisi Face-Centered " +
            "Cubic (FCC) yang saling berpenetrasi. " +
            "Setiap ion memiliki enam ion bermuatan " +
            "berlawanan sebagai tetangga terdekat.";
    }


    else if (structure === "HCP") {

        name.textContent =
            "HCP";

        subtitle.textContent =
            "Struktur Susunan Rapat Heksagonal";

        crystalSystem.textContent =
            "Heksagonal";

        lattice.textContent =
            "Heksagonal";

        atomsPerCell.textContent =
            "6 atom";

        coordination.textContent =
            "12";

        type.textContent =
            "Struktur Susunan Rapat";

        packing.textContent =
            "≈ 74%";

        bonding.textContent =
            "Logam / Tidak Berarah";

        latticeParameter.innerHTML =
            "c/a = √(8/3) ≈ 1,633";

        description.textContent =
            "HCP merupakan struktur susunan rapat dengan " +
            "urutan penumpukan lapisan ABAB.... Setiap " +
            "atom memiliki 12 tetangga terdekat. Sel " +
            "satuan heksagonal konvensional mengandung " +
            "enam atom.";
    }


    else if (structure === "Diamond") {

        name.textContent =
            "Diamond";

        subtitle.textContent =
            "Struktur Kubik Intan";

        crystalSystem.textContent =
            "Kubik";

        lattice.textContent =
            "Face-Centered Cubic (FCC) + Basis";

        atomsPerCell.textContent =
            "8 atom";

        coordination.textContent =
            "4";

        type.textContent =
            "Jaringan Kovalen";

        packing.textContent =
            "≈ 34%";

        bonding.textContent =
            "Kovalen";

        latticeParameter.innerHTML =
            "a = 4r / √3";

        description.textContent =
            "Struktur kubik intan dapat dipandang sebagai " +
            "kisi Face-Centered Cubic (FCC) dengan basis " +
            "dua atom. Setiap atom membentuk empat ikatan " +
            "kovalen dengan susunan mendekati geometri " +
            "tetrahedral.";
    }
}
// =========================================================
// STRUCTURE SWITCHING
// =========================================================

const structureButtons =
    document.querySelectorAll(
        ".structure-buttons button"
    );

structureButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const structure =
                button.textContent.trim();

            structureButtons.forEach(
                btn => {

                    btn.classList.remove(
                        "active"
                    );

                }
            );

            button.classList.add(
                "active"
            );

            currentStructure =
                structure;

            clearCrystal();

            if (structure === "NaCl") {

                buildNaCl();

            }

            else if (structure === "HCP") {

                buildHCP();

            }

            else if (structure === "Diamond") {

                buildDiamond();

            }
            updateInfo(
    structure
);
updateContributionInfo();
updateContributionMode();

        }
    );

});

// =========================================================
// VISUAL CONTROLS
// =========================================================

const atomsButton =
    document.getElementById(
        "toggle-atoms"
    );

const bondsButton =
    document.getElementById(
        "toggle-bonds"
    );

const cellButton =
    document.getElementById(
        "toggle-cell"
    );

const contributionButton =
    document.getElementById(
        "toggle-contribution"
    );

const resetButton =
    document.getElementById(
        "reset-camera"
    );

// ---------------------------------------------------------
// ATOMS
// ---------------------------------------------------------

atomsButton.addEventListener(
    "click",
    () => {

        crystalGroup.visible =
            !crystalGroup.visible;

        atomsButton.classList.toggle(
            "active",
            crystalGroup.visible
        );

    }
);

// ---------------------------------------------------------
// BONDS
// ---------------------------------------------------------

bondsButton.addEventListener(
    "click",
    () => {

        bondGroup.visible =
            !bondGroup.visible;

        bondsButton.classList.toggle(
            "active",
            bondGroup.visible
        );

    }
);

// ---------------------------------------------------------
// UNIT CELL
// ---------------------------------------------------------

cellButton.addEventListener(
    "click",
    () => {

        unitCellGroup.visible =
            !unitCellGroup.visible;

        cellButton.classList.toggle(
            "active",
            unitCellGroup.visible
        );

    }
);

// ---------------------------------------------------------
// CONTRIBUTION MODE
// ---------------------------------------------------------

contributionButton.addEventListener(
    "click",
    () => {

        contributionMode =
            !contributionMode;

        contributionButton.classList.toggle(
            "active",
            contributionMode
        );

        updateContributionMode();

    }
);

// ---------------------------------------------------------
// RESET CAMERA
// ---------------------------------------------------------

resetButton.addEventListener(
    "click",
    () => {

        resetCamera();

    }
);

// =========================================================
// SMOOTH MOUSE WHEEL ZOOM
// =========================================================

renderer.domElement.addEventListener(
    "wheel",
    event => {

        event.preventDefault();

        targetDistance +=
            event.deltaY * 0.003;

        targetDistance =
            THREE.MathUtils.clamp(
                targetDistance,
                2.5,
                15
            );

    },
    { passive: false }
);

// =========================================================
// RESIZE
// =========================================================

function resizeRenderer() {

    const width =
        simulator.clientWidth;

    const height =
        simulator.clientHeight;

    camera.aspect =
        width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(
        width,
        height
    );

}

window.addEventListener(
    "resize",
    resizeRenderer
);

// =========================================================
// ANIMATION LOOP
// =========================================================

function animate() {

    requestAnimationFrame(
        animate
    );

    controls.update();

    currentDistance +=
        (
            targetDistance -
            currentDistance
        ) * 0.12;

    const direction =
        new THREE.Vector3()
            .subVectors(
                camera.position,
                controls.target
            )
            .normalize();

    camera.position.copy(
        controls.target.clone()
            .add(
                direction.multiplyScalar(
                    currentDistance
                )
            )
    );

    renderer.render(
        scene,
        camera
    );

}

// =========================================================
// INITIALIZE
// =========================================================

buildNaCl();

updateInfo("NaCl");

updateContributionInfo();

atomsButton.classList.add(
    "active"
);

bondsButton.classList.add(
    "active"
);

cellButton.classList.add(
    "active"
);

resizeRenderer();

// VERY IMPORTANT
animate();