import React from "react";
import { defineApp } from "umi";
import { ConfigProvider } from "antd";
import { GoogleOAuthProvider } from "@react-oauth/google";

export default defineApp({
  rootContainer,
});

function rootContainer(container: JSX.Element) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1DA77F",
        },
      }}
    >
      <GoogleOAuthProvider clientId="473611431220-s33qasgksk2ekmj0qj06ovvs8972skd8.apps.googleusercontent.com">
        {container}
      </GoogleOAuthProvider>
    </ConfigProvider>
  );
}
