// Builds a tiny Mixamo-style animation as ASCII FBX for tests: "mixamorig:Hips" and
// "mixamorig:RightArm" (centimetres, like Mixamo), the arm lifts twice. Made here so no
// Mixamo file (which may not be redistributed) is needed.
const TICKS = 46_186_158_000; // FBX time units per second

export function makeMixamoFbx(seconds = 2) {
  const times = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * seconds * TICKS));
  const curve = (id, values) => `	AnimationCurve: ${id}, "AnimCurve::", "" {
		Default: 0
		KeyVer: 4008
		KeyTime: *${times.length} {
			a: ${times.join(',')}
		}
		KeyValueFloat: *${values.length} {
			a: ${values.join(',')}
		}
	}`;
  const model = (id, name, [x, y, z]) => `	Model: ${id}, "Model::mixamorig:${name}", "LimbNode" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",${x},${y},${z}
		}
	}`;
  return `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",2
		P: "FrontAxisSign", "int", "Integer", "",1
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
${model(1001, 'Hips', [0, 100, 0])}
${model(1002, 'RightArm', [-20, 30, 0])}
	AnimationStack: 2001, "AnimStack::mixamo.com", "" {
		Properties70:  {
			P: "LocalStop", "KTime", "Time", "",${times.at(-1)}
		}
	}
	AnimationLayer: 2002, "AnimLayer::BaseLayer", "" {
	}
	AnimationCurveNode: 2003, "AnimCurveNode::R", "" {
		Properties70:  {
			P: "d|X", "Number", "", "A",0
			P: "d|Y", "Number", "", "A",0
			P: "d|Z", "Number", "", "A",0
		}
	}
${curve(3001, [0, 0, 0, 0, 0])}
${curve(3002, [0, 0, 0, 0, 0])}
${curve(3003, [0, -70, -45, -70, 0])}
}
Connections:  {
	C: "OO",1001,0
	C: "OO",1002,1001
	C: "OO",2002,2001
	C: "OO",2003,2002
	C: "OP",2003,1002, "Lcl Rotation"
	C: "OP",3001,2003, "d|X"
	C: "OP",3002,2003, "d|Y"
	C: "OP",3003,2003, "d|Z"
}
`;
}
