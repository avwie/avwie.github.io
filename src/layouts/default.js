import * as React from "react"
import {Helmet} from "react-helmet";

const DefaultLayout = ({ title, children }) => {

    return (
        <>
            <Helmet>
                <title>{title ? title : "avwie's programming blog"}</title>
            </Helmet>
            <nav className="navbar navbar-dark bg-dark">
                <div className="container-lg d-flex">
                    <span className="navbar-brand mt-2 mb-2 h1"><a className="text-decoration-none text-white" href="/">@avwie's programming blog</a></span>
                    <div className="text-light mx-3">
                        <a className="px-2" title="Github" href="https://github.com/avwie" target="_blank"
                           rel="noreferrer">
                            <img alt="Github" width="24" height="24" src="/layout/github-48.png"/>
                        </a>
                        <a className="px-2" title="Mail" href="mailto:info@avwie.nl" target="_blank" rel="noreferrer">
                            <img alt="Mail" width="24" height="24" src="/layout/mail-48.png"/>
                        </a>
                        <a className="px-2" title="Twitter" href="https://twitter.com/avwie" target="_blank"
                           rel="noreferrer">
                            <img alt="Twitter" width="24" height="24" src="/layout/twitter-48.png"/>
                        </a>
                    </div>
                </div>
            </nav>
            <div className="container-lg mt-4">
                {children}
            </div>
        </>
    )
}

export default DefaultLayout