import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CameraPanel from "./pages/CameraPanel";
import AccessRecords from "./pages/AccessRecords";
import Analytics from "./pages/Analytics";
import AnalysisReport from "./pages/AnalysisReport";
import LLMSettings from "./pages/LLMSettings";
import UserProfile from "./pages/UserProfile";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/cameras" component={CameraPanel} />
      <Route path="/records" component={AccessRecords} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/reports/:eventId" component={AnalysisReport} />
      <Route path="/settings/api" component={LLMSettings} />
      <Route path="/settings/profile" component={UserProfile} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
