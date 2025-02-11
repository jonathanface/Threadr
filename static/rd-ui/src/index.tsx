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
import { AuthProvider } from "react-oidc-context";
import { AuthRunner } from "./components/AuthRunner";


const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

const mode = import.meta.env.VITE_MODE;

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_z7a7yvNuO",
  client_id: "3767p133npflnb4c9r0p3tlasb",
  redirect_uri: "https://stage.docter.io",
  response_type: "code",
  scope: "email",
};

const App = (
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
  </ErrorBoundary >
);

const content = mode === 'stage' ? (
  <AuthProvider {...cognitoAuthConfig}>
    <AuthRunner>{App}</AuthRunner>
  </AuthProvider>
) : (App);


root.render(content);
