import { useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { requestExpandedMode } from "@devvit/web/client";
import { ArrowUpRight, Layers } from "lucide-react";
import "./styles.css";

function Launch() {
  const [error, setError] = useState("");
  async function openReader(event: MouseEvent<HTMLButtonElement>) {
    try { await requestExpandedMode(event.nativeEvent, "reader"); }
    catch { setError("Couldn’t open the reader. Please try again."); }
  }
  return <main className="launch">
    <div className="launch-orbit" aria-hidden="true"><Layers size={68}/></div>
    <div className="eyebrow"><span className="status-dot"/> A DIFFERENT WAY TO REDDIT</div>
    <h1>Less noise.<br/><span>More rabbit holes.</span></h1>
    <p>Your favourite subreddits. An endless wall of cards.<br/>Pick a community and see where the scroll takes you.</p>
    <button className="primary" onClick={openReader}>Open Redroller <ArrowUpRight size={19}/></button>
    {error && <p role="alert">{error}</p>}
    <div className="launch-footer">redroller<span>BUILT FOR THE SCROLL</span></div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Launch/>);
