import ReactDOM from "react-dom/client";
import { ProSidebarProvider } from "react-pro-sidebar";
import { Docter } from "./docter";
import { Loader } from "./utils/Loader";
import { LoaderProvider } from "./contexts/loader";
import { UserProvider } from "./contexts/user";
import { AlertProvider } from "./contexts/alert";
import { Toaster } from "./utils/Toaster";
import {
  CurrentSelectionsProvider,
} from "./contexts/selections";
import { AppNavigationProvider } from "./contexts/navigation";
import { WorksListProvider } from "./contexts/worksList";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <AppNavigationProvider>
    <UserProvider>
      <WorksListProvider>
        <CurrentSelectionsProvider>
          <LoaderProvider>
            <AlertProvider>
              <Toaster />
              <Loader />
              <ProSidebarProvider>
                <Docter />
              </ProSidebarProvider>
            </AlertProvider>
          </LoaderProvider>
        </CurrentSelectionsProvider>
      </WorksListProvider>
    </UserProvider>
  </AppNavigationProvider>
);
