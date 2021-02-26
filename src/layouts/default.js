import * as React from "react"

const DefaultLayout = ({ children }) => {

    return (
        <>
            <nav className="navbar navbar-dark bg-dark">
                <div className="container-lg">
                    <span className="navbar-brand mt-2 mb-2 h1"><a className="text-decoration-none text-white" href="/">@avwie programming blog</a></span>
                </div>
            </nav>
            <div className="container-lg mt-4">
                { children }
            </div>
        </>
    )
}

export default DefaultLayout