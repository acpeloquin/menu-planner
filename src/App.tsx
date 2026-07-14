import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Deals from '@/pages/Deals';
import Stores from '@/pages/Stores';
import MealPlanPage from '@/pages/MealPlan';
import GroceryListPage from '@/pages/GroceryList';
import PantryPage from '@/pages/Pantry';
import FavoritesPage from '@/pages/Favorites';

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Chargement…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="aubaines" element={<Deals />} />
        <Route path="menu" element={<MealPlanPage />} />
        <Route path="epicerie" element={<GroceryListPage />} />
        <Route path="garde-manger" element={<PantryPage />} />
        <Route path="favoris" element={<FavoritesPage />} />
        <Route path="stores" element={<Stores />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
