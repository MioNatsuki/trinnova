import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import './Layout.css';

function Layout() {
  return (
    <div className="app-layout">
      <Header />
      <div className="main-container">
        <Sidebar />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;