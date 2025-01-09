import React from "react";
import ReactDOM from "react-dom/client";
import { ProSidebarProvider } from "react-pro-sidebar";
import { Threadr } from "./Threadr";
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

const render = (Component: React.ComponentType) => {
  root.render(
    <AppNavigationProvider>
      <SeriesSelectionProvider>
        <StorySelectionProvider>
          <LoaderProvider>
            <AlertProvider>
              <UserProvider>
                <WorksListContextProvider>
                  <Loader />
                  <Toaster />
                  <ProSidebarProvider>
                    <Component />
                  </ProSidebarProvider>
                </WorksListContextProvider>
              </UserProvider>
            </AlertProvider>
          </LoaderProvider>
        </StorySelectionProvider>
      </SeriesSelectionProvider>
    </AppNavigationProvider>
  );
};

render(Threadr);
