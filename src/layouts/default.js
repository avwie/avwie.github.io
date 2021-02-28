import * as React from "react"

const DefaultLayout = ({ children }) => {

    return (
        <>
            <nav className="navbar navbar-dark bg-dark">
                <div className="container-lg d-flex">
                    <span className="navbar-brand mt-2 mb-2 h1"><a className="text-decoration-none text-white" href="/">@avwie's programming blog</a></span>
                    <div className="text-light mx-3">
                        <a title="Github" href="https://github.com/avwie" target="_blank" rel="noopener">
                            <img alt="Github" width="24" height="24" src="/layout/github.png" />
                        </a>
                    </div>
                </div>
            </nav>
            <div className="container-lg mt-4">
                { children }
            </div>
        </>
    )
}

export default DefaultLayout