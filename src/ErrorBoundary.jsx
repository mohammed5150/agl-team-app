import { theme } from "./constants.js";
import { reportError } from "./errorReporter.js";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    // A crash that only reaches console.error is a crash nobody hears about:
    // an operations team on shift works around it rather than reporting it.
    // reportError swallows its own failures, so this cannot make the crash
    // worse, and it logs to the console either way.
    reportError({
      kind: "render",
      message: err?.message || String(err),
      stack: err?.stack,
      component: info?.componentStack?.trim().split("\n")[0]?.trim(),
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", background:theme.bg, color:theme.tx, padding:24, textAlign:"center",
          maxWidth:480, margin:"0 auto"
        }}>
          <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
          <h1 style={{ fontSize:20, marginBottom:8 }}>Something went wrong</h1>
          <p style={{ color:theme.ts, fontSize:14, marginBottom:20, lineHeight:1.5 }}>
            {this.state.err?.message || "An unexpected error occurred."}
          </p>
          <button type="button" onClick={() => this.setState({ hasError: false, err: null })}
            style={{
              padding:"12px 22px", borderRadius:10, border:"none", cursor:"pointer",
              background:theme.ga, color:"#fff", fontWeight:700, fontSize:14
            }}
          >Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
