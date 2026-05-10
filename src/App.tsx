/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "../../../../Downloads/reddit-consensus-engine (5)/src/pages/HomePage.tsx";
import SearchResultsPage from "../../../../Downloads/reddit-consensus-engine (5)/src/pages/SearchResultsPage.tsx";
import { AppProvider } from "../../../../Downloads/reddit-consensus-engine (5)/src/context/AppContext.tsx";

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

