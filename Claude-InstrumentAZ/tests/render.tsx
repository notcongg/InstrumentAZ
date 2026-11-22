// Server-render smoke test of every non-WebGL workspace (catches runtime exceptions in render logic).
import { renderToString } from "react-dom/server";
import React from "react";
import EngineeringWorkspace from "../src/components/EngineeringWorkspace";
import LabWorkspace from "../src/components/LabWorkspace";
import CodingWorkspace from "../src/components/CodingWorkspace";
import { AudioWorkspace, SimulationWorkspace } from "../src/components/AudioSimWorkspaces";
import ManufacturingWorkspace from "../src/components/ManufacturingWorkspace";
import LibraryWorkspace from "../src/components/LibraryWorkspace";
import SchematicEditor from "../src/components/SchematicEditor";
import { Welcome, Settings, About, Wizard } from "../src/components/MiscWorkspaces";
import { set } from "../src/lib/iaz/store";

const items: [string, React.ReactElement][] = [["Engineering", <EngineeringWorkspace />], ["Lab", <LabWorkspace />], ["Coding", <CodingWorkspace />], ["Audio", <AudioWorkspace />], ["Simulation", <SimulationWorkspace />], ["Manufacturing", <ManufacturingWorkspace />], ["Library", <LibraryWorkspace />], ["Schematic", <SchematicEditor />], ["Welcome", <Welcome />], ["Settings", <Settings />], ["About", <About />], ["Wizard", <Wizard onClose={() => {}} />]];
let bad = 0;
for (const [n, el] of items) { try { const h = renderToString(el); console.log("OK  ", n, h.length); } catch (e) { bad++; console.log("FAIL", n, (e as Error).stack?.split("\n").slice(0, 4).join("\n")); } }
void set;
process.exit(bad ? 1 : 0);
