import ReactDOM from "react-dom/client";
import { Docter } from "./docter";
import { Loader } from "./utils/Loader";
import { LoaderProvider } from "./contexts/loader";
import { UserProvider } from "./contexts/user";
import { AlertProvider } from "./contexts/alert";
import { Toaster } from "./utils/Toaster";
import { WorksListProvider } from "./contexts/worksList";
import { BrowserRouter } from 'react-router-dom';
import { SelectionsProvider } from "./contexts/selections";
import { ErrorBoundary } from "./components/ErrorBoundary";


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
