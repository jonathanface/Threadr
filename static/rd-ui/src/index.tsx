import ReactDOM from "react-dom/client";
import { ProSidebarProvider } from "react-pro-sidebar";
import { Docter } from "./docter";
import { Loader } from "./utils/Loader";
import { LoaderProvider } from "./contexts/loader";
import { UserProvider } from "./contexts/user";
import { AlertProvider } from "./contexts/alert";
import { Toaster } from "./utils/Toaster";
import {
  SeriesSelectionProvider,
  StorySelectionProvider,
} from "./contexts/selections";
import { AppNavigationProvider } from "./contexts/navigation";
import { WorksListContextProvider } from "./contexts/worksList";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <AppNavigationProvider>
    <UserProvider>
      <WorksListContextProvider>
        <SeriesSelectionProvider>
          <StorySelectionProvider>
            <LoaderProvider>
              <AlertProvider>
                <Toaster />
                <Loader />
                <ProSidebarProvider>
                  <Docter />
                </ProSidebarProvider>
              </AlertProvider>
            </LoaderProvider>
          </StorySelectionProvider>
        </SeriesSelectionProvider>
      </WorksListContextProvider>
    </UserProvider>
  </AppNavigationProvider>
);
