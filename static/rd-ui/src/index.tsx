import React from "react";
import ReactDOM from "react-dom/client";
import { ProSidebarProvider } from "react-pro-sidebar";
import { Provider } from "react-redux";
import Threadr from "./Threadr";
import { store } from "./stores/store";
import Loader from "./utils/Loader";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

const render = (Component: React.ComponentType<any>) => {
  root.render(
    <Provider store={store}>
      <Loader />
      <ProSidebarProvider>
        <Component />
      </ProSidebarProvider>
    </Provider>
  );
};

render(Threadr);
