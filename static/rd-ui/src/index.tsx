import ReactDOM from "react-dom/client";
import { Docter } from "./docter";
import { Loader } from "./utils/Loader";
import { Toaster } from "./utils/Toaster";
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoaderProvider } from "./providers/loader";
import { UserProvider } from "./providers/user";
import { SelectionsProvider } from "./providers/selections";
import { WorksListProvider } from "./providers/worksList";
import { AlertProvider } from "./providers/alert";


const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <ErrorBoundary>
    <BrowserRouter>
      <LoaderProvider>
        <AlertProvider>
          <UserProvider>
            <SelectionsProvider>
              <WorksListProvider>
                <Toaster />
                <Loader />
                <Docter />
              </WorksListProvider>
            </SelectionsProvider>
          </UserProvider>
        </AlertProvider>
      </LoaderProvider>
    </BrowserRouter>
  </ErrorBoundary>
);
